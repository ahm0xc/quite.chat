import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import {
  conversationMembers,
  conversations,
  messageAttachments,
  messages,
  users,
} from "~/db/schema";
import { getMessagePreview } from "~/lib/message-preview";
import { pusherServer } from "~/lib/pusher-server";
import { createR2DownloadUrl, createR2UploadUrl } from "~/lib/r2";
import { getSystemPreview } from "~/lib/system-messages";
import type { SystemMessageData } from "~/lib/system-messages";

import { protectedProcedure } from "../init";

const attachmentMimeType = z
  .string()
  .regex(
    /^(image\/|video\/(mp4|webm|quicktime|x-matroska|mkv)|application\/pdf)/,
  );

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const PDF_MAX_BYTES = 25 * 1024 * 1024;

async function withAttachmentUrls<
  T extends { objectKey: string; metadata: Record<string, unknown> | null },
>(rows: Array<T>) {
  return Promise.all(
    rows.map(async ({ objectKey, metadata, ...rest }) => {
      const posterKey = metadata?.["posterKey"];
      return {
        ...rest,
        metadata,
        objectKey,
        url: await createR2DownloadUrl(objectKey),
        posterUrl:
          typeof posterKey === "string" && posterKey
            ? await createR2DownloadUrl(posterKey)
            : undefined,
        willExpireAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    }),
  );
}

function getGroupFallbackTitle(
  members: Array<{ displayName: string | null; username: string | null }>,
  _currentUserId: number,
) {
  const names = members
    .map((m) => m.displayName ?? m.username ?? "Unknown")
    .slice(0, 3);
  if (members.length > 3) return `${names.join(", ")} +${members.length - 3}`;
  if (names.length === 0) return "Group";
  return names.join(", ");
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTx;

type SystemMessageRow = {
  id: number;
  conversationId: number;
  body: string;
  senderId: number | null;
  kind: "user" | "system";
  metadata: unknown;
  createdAt: Date;
  deletedAt: Date | null;
};

const systemMessageReturning = {
  id: messages.id,
  conversationId: messages.conversationId,
  body: messages.body,
  senderId: messages.senderId,
  kind: messages.kind,
  metadata: messages.metadata,
  createdAt: messages.createdAt,
  deletedAt: messages.deletedAt,
} as const;

async function triggerSystemMessage(
  conversationId: number,
  sysMsg: SystemMessageRow,
  username: string | null,
) {
  try {
    await pusherServer.trigger(
      `private-conversation-${conversationId}`,
      "message.created",
      {
        id: sysMsg.id,
        conversationId: sysMsg.conversationId,
        body: sysMsg.body,
        senderId: sysMsg.senderId,
        kind: sysMsg.kind,
        metadata: sysMsg.metadata,
        createdAt: sysMsg.createdAt,
        username,
        deletedAt: sysMsg.deletedAt,
        attachments: [],
      },
    );
  } catch {}
}

async function triggerConversationsRefresh(conversationId: number) {
  try {
    await pusherServer.trigger("presence-global", "conversations.refresh", {
      conversationId,
    });
  } catch {}
}

async function getUserSnapshot(userId: number) {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows.length || !rows[0]) {
    return {
      id: userId,
      username: null,
      displayName: "Unknown",
      name: "Unknown",
    };
  }
  const u = rows[0];
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName ?? u.username ?? "Unknown",
    name: u.displayName ?? u.username ?? "Unknown",
  };
}

async function transferOwnershipIfNeeded(
  client: DbClient,
  conversationId: number,
  leavingUserId: number,
): Promise<SystemMessageRow | null> {
  const members = await client
    .select({
      userId: conversationMembers.userId,
      role: conversationMembers.role,
      joinedAt: conversationMembers.joinedAt,
    })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        isNull(conversationMembers.leftAt),
      ),
    );

  const leaving = members.find((m) => m.userId === leavingUserId);
  if (!leaving || leaving.role !== "owner") return null;
  if (members.length <= 1) return null;
  const candidates = members.filter((m) => m.userId !== leavingUserId);
  candidates.sort((a, b) => {
    const aIsAdmin = a.role === "admin" ? 0 : 1;
    const bIsAdmin = b.role === "admin" ? 0 : 1;
    if (aIsAdmin !== bIsAdmin) return aIsAdmin - bIsAdmin;
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });
  const next = candidates.at(0);
  if (!next) return null;
  await client
    .update(conversationMembers)
    .set({ role: "owner" })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, next.userId),
      ),
    );
  const prevSnap = await getUserSnapshot(leavingUserId);
  const nextSnap = await getUserSnapshot(next.userId);
  const meta: SystemMessageData = {
    type: "ownership_transferred",
    prevOwnerId: leavingUserId,
    prevOwnerName: prevSnap.name,
    newOwnerId: next.userId,
    newOwnerName: nextSnap.name,
    newOwnerUsername: nextSnap.username,
  };
  const [sysMsg] = await client
    .insert(messages)
    .values({
      conversationId,
      kind: "system",
      senderId: null,
      body: "",
      metadata: meta,
    })
    .returning(systemMessageReturning);
  return sysMsg;
}

export const conversationsRouter = {
  createUploadUrl: protectedProcedure
    .input(
      z
        .object({
          conversationId: z.number(),
          fileName: z.string().min(1).max(255),
          mimeType: attachmentMimeType,
          sizeBytes: z.number().int().positive().max(VIDEO_MAX_BYTES),
        })
        .refine(
          (value) =>
            value.mimeType.startsWith("video/")
              ? value.sizeBytes <= VIDEO_MAX_BYTES
              : value.mimeType === "application/pdf"
                ? value.sizeBytes <= PDF_MAX_BYTES
                : value.sizeBytes <= IMAGE_MAX_BYTES,
          "File too large",
        ),
    )
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const objectKey = `conversations/${input.conversationId}/users/${ctx.userId}/uploads/${crypto.randomUUID()}-${safeName}`;
      return {
        objectKey,
        uploadUrl: await createR2UploadUrl(objectKey, input.mimeType),
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const convoIds = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .innerJoin(
        conversations,
        eq(conversationMembers.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversationMembers.userId, ctx.userId),
          isNull(conversationMembers.leftAt),
          isNull(conversations.deletedAt),
        ),
      )
      .then((rows) => [...new Set(rows.map((r) => r.conversationId))]);

    if (convoIds.length === 0) return [];

    const convoRows = await db
      .select({
        id: conversations.id,
        type: conversations.type,
        title: conversations.title,
        createdBy: conversations.createdBy,
      })
      .from(conversations)
      .where(inArray(conversations.id, convoIds));

    const convoMap = new Map(convoRows.map((c) => [c.id, c]));

    const allMembers = await db
      .select({
        conversationId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        presenceStatus: users.presenceStatus,
        role: conversationMembers.role,
        lastReadMessageId: conversationMembers.lastReadMessageId,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(
        and(
          inArray(conversationMembers.conversationId, convoIds),
          isNull(conversationMembers.leftAt),
        ),
      );

    const lastMessages = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        body: messages.body,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
        deletedAt: messages.deletedAt,
        kind: messages.kind,
        metadata: messages.metadata,
      })
      .from(messages)
      .where(inArray(messages.conversationId, convoIds))
      .orderBy(desc(messages.createdAt));

    const messageAttachmentsByMessage = new Map<
      number,
      Array<{ mimeType: string }>
    >();
    if (lastMessages.length) {
      const ids = lastMessages.map((m) => m.id);
      const attachmentRows = await db
        .select({
          messageId: messageAttachments.messageId,
          mimeType: messageAttachments.mimeType,
        })
        .from(messageAttachments)
        .where(inArray(messageAttachments.messageId, ids));
      for (const attachment of attachmentRows) {
        const current =
          messageAttachmentsByMessage.get(attachment.messageId) ?? [];
        current.push(attachment);
        messageAttachmentsByMessage.set(attachment.messageId, current);
      }
    }

    const lastMsgByConvo = new Map<
      number,
      { id: number; body: string; createdAt: Date; senderId: number | null }
    >();
    for (const msg of lastMessages) {
      if (!lastMsgByConvo.has(msg.conversationId)) {
        let preview: string;
        if (msg.deletedAt) preview = "This message was deleted";
        else if (msg.kind === "system" && msg.metadata) {
          try {
            preview = getSystemPreview(
              msg.metadata as unknown as SystemMessageData,
            );
          } catch {
            preview = msg.body || "System message";
          }
        } else {
          preview = getMessagePreview(
            msg.body,
            messageAttachmentsByMessage.get(msg.id),
          );
        }
        lastMsgByConvo.set(msg.conversationId, {
          id: msg.id,
          body: preview,
          createdAt: msg.createdAt,
          senderId: msg.senderId,
        });
      }
    }

    const membersByConvo = new Map<number, typeof allMembers>();
    for (const member of allMembers) {
      const list = membersByConvo.get(member.conversationId) ?? [];
      list.push(member);
      membersByConvo.set(member.conversationId, list);
    }

    return convoIds
      .map((convoId) => {
        const convo = convoMap.get(convoId);
        const members = membersByConvo.get(convoId) ?? [];
        const lastMessage = lastMsgByConvo.get(convoId) ?? null;
        const currentMember = members.find((m) => m.userId === ctx.userId);
        const lastReadMessageId = currentMember?.lastReadMessageId ?? 0;
        const unreadCount = lastMessages.filter(
          (message) =>
            message.conversationId === convoId &&
            message.senderId !== ctx.userId &&
            message.id > lastReadMessageId,
        ).length;

        if (convo?.type === "group") {
          const title =
            convo.title?.trim() ||
            getGroupFallbackTitle(
              members.filter((m) => m.userId !== ctx.userId),
              ctx.userId,
            );
          return {
            id: convoId,
            type: "group" as const,
            title,
            rawTitle: convo.title,
            members,
            memberCount: members.length,
            lastMessage,
            unreadCount,
            hasUnread: unreadCount > 0,
            otherUser: null,
          };
        }

        const otherMember = members.find((m) => m.userId !== ctx.userId);
        return {
          id: convoId,
          type: "direct" as const,
          otherUser: otherMember
            ? {
                id: otherMember.userId,
                username: otherMember.username,
                displayName: otherMember.displayName,
                avatarUrl: otherMember.avatarUrl,
                presenceStatus: otherMember.presenceStatus,
              }
            : null,
          lastMessage,
          unreadCount,
          hasUnread: unreadCount > 0,
        };
      })
      .sort((a, b) => {
        const aTime = a.lastMessage?.createdAt.getTime() ?? 0;
        const bTime = b.lastMessage?.createdAt.getTime() ?? 0;
        return bTime - aTime;
      });
  }),

  details: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const convoRows = await db
        .select({
          id: conversations.id,
          type: conversations.type,
          title: conversations.title,
          createdBy: conversations.createdBy,
          deletedAt: conversations.deletedAt,
        })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (!convoRows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const convo = convoRows[0];
      const members = await db
        .select({
          userId: conversationMembers.userId,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          presenceStatus: users.presenceStatus,
          role: conversationMembers.role,
          joinedAt: conversationMembers.joinedAt,
        })
        .from(conversationMembers)
        .innerJoin(users, eq(conversationMembers.userId, users.id))
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            isNull(conversationMembers.leftAt),
          ),
        );

      if (convo.type === "group") {
        const title =
          convo.title?.trim() ||
          getGroupFallbackTitle(
            members.filter((m) => m.userId !== ctx.userId),
            ctx.userId,
          );
        return {
          id: convo.id,
          type: "group" as const,
          title,
          rawTitle: convo.title,
          createdBy: convo.createdBy,
          members,
          otherUser: null,
        };
      }

      const otherMember = members.find((m) => m.userId !== ctx.userId);
      return {
        id: convo.id,
        type: "direct" as const,
        title: null,
        rawTitle: null,
        createdBy: convo.createdBy,
        members,
        otherUser: otherMember
          ? {
              id: otherMember.userId,
              username: otherMember.username,
              displayName: otherMember.displayName,
              avatarUrl: otherMember.avatarUrl,
              presenceStatus: otherMember.presenceStatus,
            }
          : null,
      };
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.number(), messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const message = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.id, input.messageId),
            eq(messages.conversationId, input.conversationId),
          ),
        )
        .limit(1);
      if (!message[0])
        throw new Error("Message does not belong to conversation");
      await db
        .update(conversationMembers)
        .set({ lastReadMessageId: message[0].id })
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId),
          ),
        );
      return { success: true };
    }),

  getOrCreate: protectedProcedure
    .input(z.object({ targetUserId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.targetUserId === ctx.userId) {
        throw new Error("Cannot create conversation with yourself");
      }

      const existing = await db
        .select({ conversationId: conversationMembers.conversationId })
        .from(conversationMembers)
        .innerJoin(
          conversations,
          eq(conversationMembers.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversationMembers.userId, ctx.userId),
            isNull(conversationMembers.leftAt),
            isNull(conversations.deletedAt),
            eq(conversations.type, "direct"),
          ),
        );

      const existingConvoIds = existing.map((r) => r.conversationId);
      if (existingConvoIds.length > 0) {
        const directConvos = await db
          .select({
            conversationId: conversationMembers.conversationId,
          })
          .from(conversationMembers)
          .innerJoin(
            conversations,
            eq(conversationMembers.conversationId, conversations.id),
          )
          .where(
            and(
              inArray(conversationMembers.conversationId, existingConvoIds),
              eq(conversationMembers.userId, input.targetUserId),
              isNull(conversationMembers.leftAt),
              eq(conversations.type, "direct"),
              isNull(conversations.deletedAt),
            ),
          );

        if (directConvos[0]) {
          return { conversationId: directConvos[0].conversationId };
        }
      }

      const [convo] = await db
        .insert(conversations)
        .values({ type: "direct", createdBy: ctx.userId })
        .returning({ id: conversations.id });

      await db.insert(conversationMembers).values([
        { conversationId: convo.id, userId: ctx.userId, role: "owner" },
        {
          conversationId: convo.id,
          userId: input.targetUserId,
          role: "member",
        },
      ]);

      return { conversationId: convo.id };
    }),

  createGroup: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().max(50).optional(),
        memberIds: z.array(z.number()).min(2).max(19),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const uniqueIds = [...new Set(input.memberIds)];
      if (uniqueIds.includes(ctx.userId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot add yourself separately",
        });
      if (uniqueIds.length !== input.memberIds.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Duplicate members",
        });
      if (uniqueIds.length < 2)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Need at least 2 other members",
        });

      const allUserIds = [ctx.userId, ...uniqueIds];
      const found = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, allUserIds));
      if (found.length !== allUserIds.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some users not found",
        });

      const title = input.title?.trim() || null;
      const actorSnap = await getUserSnapshot(ctx.userId);

      // transaction: create convo + members + system msg
      const convoId = await db.transaction(async (tx) => {
        const [convo] = await tx
          .insert(conversations)
          .values({ type: "group", title, createdBy: ctx.userId })
          .returning({ id: conversations.id });

        const memberRows = [
          {
            conversationId: convo.id,
            userId: ctx.userId,
            role: "owner" as const,
          },
          ...uniqueIds.map((id) => ({
            conversationId: convo.id,
            userId: id,
            role: "member" as const,
          })),
        ];
        await tx.insert(conversationMembers).values(memberRows);

        const meta: SystemMessageData = {
          type: "group_created",
          actorId: ctx.userId,
          actorName: actorSnap.name,
          actorUsername: actorSnap.username,
        };
        await tx.insert(messages).values({
          conversationId: convo.id,
          kind: "system",
          senderId: null,
          body: "",
          metadata: meta,
        });

        return convo.id;
      });

      // fetch system message for pusher
      const sys = await db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          senderId: messages.senderId,
          kind: messages.kind,
          metadata: messages.metadata,
          createdAt: messages.createdAt,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, convoId))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (sys[0]) {
        try {
          await pusherServer.trigger(
            `private-conversation-${convoId}`,
            "message.created",
            {
              id: sys[0].id,
              conversationId: sys[0].conversationId,
              body: sys[0].body,
              senderId: sys[0].senderId,
              kind: sys[0].kind,
              metadata: sys[0].metadata,
              createdAt: sys[0].createdAt,
              username: null,
              deletedAt: sys[0].deletedAt,
              attachments: [],
            },
          );
        } catch {}
        try {
          await pusherServer.trigger(
            "presence-global",
            "conversations.refresh",
            {
              conversationId: convoId,
            },
          );
        } catch {}
      }

      return { conversationId: convoId };
    }),

  addMembers: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        userIds: z.array(z.number()).min(1).max(19),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      await assertGroupAdmin(ctx.userId, input.conversationId);
      const convoRows = await db
        .select({
          type: conversations.type,
          deletedAt: conversations.deletedAt,
        })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (
        !convoRows[0] ||
        convoRows[0].type !== "group" ||
        convoRows[0].deletedAt
      )
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a group" });

      const unique = [...new Set(input.userIds)];
      if (unique.includes(ctx.userId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Already in group",
        });

      const found = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
        })
        .from(users)
        .where(inArray(users.id, unique));
      if (found.length !== unique.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some users not found",
        });

      const actorSnap = await getUserSnapshot(ctx.userId);
      const targets = new Map(found.map((u) => [u.id, u]));

      const sysMsgs = await db.transaction(async (tx) => {
        const existing = await tx
          .select({
            userId: conversationMembers.userId,
            leftAt: conversationMembers.leftAt,
          })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, input.conversationId),
              inArray(conversationMembers.userId, unique),
            ),
          );
        if (existing.some((row) => !row.leftAt))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Already a member",
          });

        const active = await tx
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, input.conversationId),
              isNull(conversationMembers.leftAt),
            ),
          );
        if (active.length + unique.length > 20)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Group limit 20 exceeded",
          });

        const now = new Date();
        const existingIds = new Set(existing.map((row) => row.userId));
        for (const row of existing) {
          await tx
            .update(conversationMembers)
            .set({
              leftAt: null,
              role: "member",
              joinedAt: now,
              lastReadMessageId: null,
            })
            .where(
              and(
                eq(conversationMembers.conversationId, input.conversationId),
                eq(conversationMembers.userId, row.userId),
              ),
            );
        }
        const toInsert = unique.filter((id) => !existingIds.has(id));
        if (toInsert.length) {
          await tx.insert(conversationMembers).values(
            toInsert.map((userId) => ({
              conversationId: input.conversationId,
              userId,
              role: "member" as const,
            })),
          );
        }

        const messageValues = unique.map((targetId) => {
          const target = targets.get(targetId);
          const meta: SystemMessageData = {
            type: "member_added",
            actorId: ctx.userId,
            actorName: actorSnap.name,
            actorUsername: actorSnap.username,
            targetId,
            targetName: target?.displayName ?? target?.username ?? "Unknown",
            targetUsername: target?.username ?? null,
          };
          return {
            conversationId: input.conversationId,
            kind: "system" as const,
            senderId: ctx.userId,
            body: "",
            metadata: meta,
          };
        });
        return tx
          .insert(messages)
          .values(messageValues)
          .returning(systemMessageReturning);
      });

      for (const sysMsg of sysMsgs) {
        await triggerSystemMessage(
          input.conversationId,
          sysMsg,
          actorSnap.username,
        );
      }
      await triggerConversationsRefresh(input.conversationId);

      return { success: true };
    }),

  removeMember: protectedProcedure
    .input(z.object({ conversationId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const convoRows = await db
        .select({
          type: conversations.type,
          deletedAt: conversations.deletedAt,
        })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (
        !convoRows[0] ||
        convoRows[0].type !== "group" ||
        convoRows[0].deletedAt
      )
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a group" });

      const isSelf = input.userId === ctx.userId;
      if (!isSelf) {
        await assertGroupAdmin(ctx.userId, input.conversationId);
        const target = await db
          .select({ role: conversationMembers.role })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, input.conversationId),
              eq(conversationMembers.userId, input.userId),
              isNull(conversationMembers.leftAt),
            ),
          )
          .limit(1);
        if (!target[0])
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target not a member",
          });
        if (target[0].role === "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot remove owner",
          });
        }
      } else {
        const self = await db
          .select({ role: conversationMembers.role })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, input.conversationId),
              eq(conversationMembers.userId, ctx.userId),
              isNull(conversationMembers.leftAt),
            ),
          )
          .limit(1);
        if (!self[0]) throw new TRPCError({ code: "NOT_FOUND" });
      }

      let meta: SystemMessageData;
      if (isSelf) {
        const snap = await getUserSnapshot(ctx.userId);
        meta = {
          type: "member_left",
          actorId: ctx.userId,
          actorName: snap.name,
          actorUsername: snap.username,
        };
      } else {
        const actorSnap = await getUserSnapshot(ctx.userId);
        const targetSnap = await getUserSnapshot(input.userId);
        meta = {
          type: "member_kicked",
          actorId: ctx.userId,
          actorName: actorSnap.name,
          actorUsername: actorSnap.username,
          targetId: input.userId,
          targetName: targetSnap.name,
          targetUsername: targetSnap.username,
        };
      }

      const { ownershipMsg, leaveMsg } = await db.transaction(async (tx) => {
        const transferred = await transferOwnershipIfNeeded(
          tx,
          input.conversationId,
          input.userId,
        );
        await tx
          .update(conversationMembers)
          .set({ leftAt: new Date() })
          .where(
            and(
              eq(conversationMembers.conversationId, input.conversationId),
              eq(conversationMembers.userId, input.userId),
            ),
          );
        const remaining = await tx
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, input.conversationId),
              isNull(conversationMembers.leftAt),
            ),
          );
        if (remaining.length === 0) {
          await tx
            .update(conversations)
            .set({ deletedAt: new Date() })
            .where(eq(conversations.id, input.conversationId));
        }
        const [leftMsg] = await tx
          .insert(messages)
          .values({
            conversationId: input.conversationId,
            kind: "system",
            senderId: ctx.userId,
            body: "",
            metadata: meta,
          })
          .returning(systemMessageReturning);
        return { ownershipMsg: transferred, leaveMsg: leftMsg };
      });
      if (ownershipMsg) {
        await triggerSystemMessage(input.conversationId, ownershipMsg, null);
      }
      await triggerSystemMessage(input.conversationId, leaveMsg, null);
      await triggerConversationsRefresh(input.conversationId);

      return { success: true };
    }),

  updateGroup: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        title: z.string().trim().min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      await assertGroupAdmin(ctx.userId, input.conversationId);
      const convoRows = await db
        .select({
          type: conversations.type,
          deletedAt: conversations.deletedAt,
        })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (
        !convoRows[0] ||
        convoRows[0].type !== "group" ||
        convoRows[0].deletedAt
      )
        throw new TRPCError({ code: "BAD_REQUEST" });
      await db
        .update(conversations)
        .set({ title: input.title.trim(), updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));
      const actorSnap = await getUserSnapshot(ctx.userId);
      const meta: SystemMessageData = {
        type: "title_changed",
        actorId: ctx.userId,
        actorName: actorSnap.name,
        actorUsername: actorSnap.username,
        newTitle: input.title.trim(),
      };
      const [sysMsg] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          kind: "system",
          senderId: ctx.userId,
          body: "",
          metadata: meta,
        })
        .returning(systemMessageReturning);
      await triggerSystemMessage(
        input.conversationId,
        sysMsg,
        actorSnap.username,
      );
      await triggerConversationsRefresh(input.conversationId);
      return { success: true };
    }),

  updateMemberRole: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        userId: z.number(),
        role: z.enum(["admin", "member"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const meRole = await db
        .select({ role: conversationMembers.role })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId),
            isNull(conversationMembers.leftAt),
          ),
        )
        .limit(1);
      if (!meRole[0] || meRole[0].role !== "owner")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owner can change roles",
        });
      if (input.userId === ctx.userId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change own role",
        });
      const target = await db
        .select({ role: conversationMembers.role })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, input.userId),
            isNull(conversationMembers.leftAt),
          ),
        )
        .limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (target[0].role === "owner")
        throw new TRPCError({ code: "FORBIDDEN" });
      const convoRows = await db
        .select({ type: conversations.type })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (!convoRows[0] || convoRows[0].type !== "group")
        throw new TRPCError({ code: "BAD_REQUEST" });
      await db
        .update(conversationMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, input.userId),
          ),
        );
      const actorSnap = await getUserSnapshot(ctx.userId);
      const targetSnap = await getUserSnapshot(input.userId);
      const meta: SystemMessageData = {
        type: "role_changed",
        actorId: ctx.userId,
        actorName: actorSnap.name,
        actorUsername: actorSnap.username,
        targetId: input.userId,
        targetName: targetSnap.name,
        targetUsername: targetSnap.username,
        newRole: input.role,
      };
      const [sysMsg] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          kind: "system",
          senderId: ctx.userId,
          body: "",
          metadata: meta,
        })
        .returning({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          senderId: messages.senderId,
          kind: messages.kind,
          metadata: messages.metadata,
          createdAt: messages.createdAt,
          deletedAt: messages.deletedAt,
        });
      try {
        await pusherServer.trigger(
          `private-conversation-${input.conversationId}`,
          "message.created",
          {
            id: sysMsg.id,
            conversationId: sysMsg.conversationId,
            body: sysMsg.body,
            senderId: sysMsg.senderId,
            kind: sysMsg.kind,
            metadata: sysMsg.metadata,
            createdAt: sysMsg.createdAt,
            username: actorSnap.username,
            deletedAt: sysMsg.deletedAt,
            attachments: [],
          },
        );
      } catch {}
      return { success: true };
    }),

  deleteGroup: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const meRole = await db
        .select({ role: conversationMembers.role })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.userId, ctx.userId),
            isNull(conversationMembers.leftAt),
          ),
        )
        .limit(1);
      if (!meRole[0] || meRole[0].role !== "owner")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owner can delete",
        });
      const convoRows = await db
        .select({
          type: conversations.type,
          deletedAt: conversations.deletedAt,
        })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (
        !convoRows[0] ||
        convoRows[0].type !== "group" ||
        convoRows[0].deletedAt
      )
        throw new TRPCError({ code: "BAD_REQUEST" });
      await db
        .update(conversations)
        .set({ deletedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));
      await db
        .update(conversationMembers)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            isNull(conversationMembers.leftAt),
          ),
        );
      try {
        await pusherServer.trigger("presence-global", "conversations.refresh", {
          conversationId: input.conversationId,
        });
      } catch {}
      return { success: true };
    }),

  messages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      return db
        .select({
          id: messages.id,
          body: messages.body,
          senderId: messages.senderId,
          kind: messages.kind,
          metadata: messages.metadata,
          createdAt: messages.createdAt,
          username: users.username,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(messages.createdAt)
        .then(async (rows) => {
          const ids = rows.map((row) => row.id);
          if (!ids.length) return rows.map((r) => ({ ...r, attachments: [] }));
          const attachments = await db
            .select()
            .from(messageAttachments)
            .where(inArray(messageAttachments.messageId, ids));
          return Promise.all(
            rows.map(async (row) => ({
              ...row,
              attachments: await withAttachmentUrls(
                attachments.filter(
                  (attachment) => attachment.messageId === row.id,
                ),
              ),
            })),
          );
        });
    }),

  deleteMessage: protectedProcedure
    .input(z.object({ conversationId: z.number(), messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const rows = await db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          kind: messages.kind,
        })
        .from(messages)
        .where(
          and(
            eq(messages.id, input.messageId),
            eq(messages.conversationId, input.conversationId),
            isNull(messages.deletedAt),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new Error("Message not found");
      if (rows[0].kind === "system")
        throw new Error("Cannot delete system message");
      if (rows[0].senderId !== ctx.userId) throw new Error("Not authorized");
      await db
        .update(messages)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(messages.id, input.messageId));
      await pusherServer.trigger(
        `private-conversation-${input.conversationId}`,
        "message.deleted",
        { id: input.messageId, conversationId: input.conversationId },
      );
      return { success: true };
    }),

  sendMessage: protectedProcedure
    .input(
      z
        .object({
          conversationId: z.number(),
          body: z.string().max(5000).default(""),
          attachments: z
            .array(
              z.object({
                objectKey: z.string().min(1),
                originalName: z.string().max(255).optional(),
                mimeType: attachmentMimeType,
                sizeBytes: z.number().int().positive().max(VIDEO_MAX_BYTES),
                metadata: z.record(z.string(), z.unknown()).optional(),
              }),
            )
            .max(10)
            .default([])
            .refine(
              (items) =>
                items.every((item) =>
                  item.mimeType.startsWith("video/")
                    ? item.sizeBytes <= VIDEO_MAX_BYTES
                    : item.mimeType === "application/pdf"
                      ? item.sizeBytes <= PDF_MAX_BYTES
                      : item.sizeBytes <= IMAGE_MAX_BYTES,
                ),
              "File too large",
            ),
        })
        .refine(
          (value) =>
            value.body.trim().length > 0 || value.attachments.length > 0,
          "Message cannot be empty",
        ),
    )
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const allowedPrefix = `conversations/${input.conversationId}/users/${ctx.userId}/uploads/`;
      for (const attachment of input.attachments) {
        if (!attachment.objectKey.startsWith(allowedPrefix)) {
          throw new Error("Invalid attachment ownership");
        }
      }
      const [inserted] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: ctx.userId,
          body: input.body.trim(),
          kind: "user",
          metadata: null,
        })
        .returning({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          senderId: messages.senderId,
          kind: messages.kind,
          metadata: messages.metadata,
          createdAt: messages.createdAt,
          deletedAt: messages.deletedAt,
        });

      if (input.attachments.length) {
        await db.insert(messageAttachments).values(
          input.attachments.map((attachment) => ({
            messageId: inserted.id,
            objectKey: attachment.objectKey,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            metadata: attachment.metadata,
          })),
        );
      }

      const [msg] = await db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          senderId: messages.senderId,
          kind: messages.kind,
          metadata: messages.metadata,
          createdAt: messages.createdAt,
          username: users.username,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.id, inserted.id))
        .limit(1);

      const attachmentRows = await db
        .select()
        .from(messageAttachments)
        .where(eq(messageAttachments.messageId, inserted.id));

      const eventMessage = {
        ...msg,
        attachments: await withAttachmentUrls(attachmentRows),
      };
      try {
        await pusherServer.trigger(
          `private-conversation-${input.conversationId}`,
          "message.created",
          eventMessage,
        );
      } catch (error) {
        console.error("Failed to publish message.created event", error);
      }

      return eventMessage;
    }),

  refreshAttachmentUrl: protectedProcedure
    .input(z.object({ attachmentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: messageAttachments.id,
          objectKey: messageAttachments.objectKey,
          metadata: messageAttachments.metadata,
          conversationId: messages.conversationId,
        })
        .from(messageAttachments)
        .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
        .where(eq(messageAttachments.id, input.attachmentId))
        .limit(1);
      if (!rows[0]) throw new Error("Attachment not found");
      await assertConversationMember(ctx.userId, rows[0].conversationId);
      const [resolved] = await withAttachmentUrls([
        { objectKey: rows[0].objectKey, metadata: rows[0].metadata },
      ]);
      return {
        url: resolved.url,
        posterUrl: resolved.posterUrl,
        objectKey: rows[0].objectKey,
        willExpireAt: resolved.willExpireAt,
      };
    }),
} satisfies TRPCRouterRecord;

async function assertConversationMember(
  userId: number,
  conversationId: number,
) {
  const member = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .innerJoin(
      conversations,
      eq(conversationMembers.conversationId, conversations.id),
    )
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
        isNull(conversationMembers.leftAt),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);

  if (!member[0]) throw new Error("Not a member of this conversation");
}

async function assertGroupAdmin(userId: number, conversationId: number) {
  const member = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
        isNull(conversationMembers.leftAt),
      ),
    )
    .limit(1);
  if (
    !member[0] ||
    (member[0].role !== "owner" && member[0].role !== "admin")
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}
