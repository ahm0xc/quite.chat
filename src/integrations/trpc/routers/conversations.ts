import type { TRPCRouterRecord } from "@trpc/server";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import {
  users,
  conversations,
  conversationMembers,
  messages,
} from "~/db/schema";
import { pusherServer } from "~/lib/pusher-server";

import { protectedProcedure } from "../init";

export const conversationsRouter = {
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
        ),
      )
      .then((rows) => [...new Set(rows.map((r) => r.conversationId))]);

    if (convoIds.length === 0) return [];

    const allMembers = await db
      .select({
        conversationId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        lastReadMessageId: conversationMembers.lastReadMessageId,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(sql`${conversationMembers.conversationId} IN ${convoIds}`);

    const lastMessages = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        body: messages.body,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .where(sql`${messages.conversationId} IN ${convoIds}`)
      .orderBy(desc(messages.createdAt));

    const lastMsgByConvo = new Map<
      number,
      { id: number; body: string; createdAt: Date; senderId: number }
    >();
    for (const msg of lastMessages) {
      if (!lastMsgByConvo.has(msg.conversationId)) {
        lastMsgByConvo.set(msg.conversationId, {
          id: msg.id,
          body: msg.deletedAt ? "This message was deleted" : msg.body,
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
        const members = membersByConvo.get(convoId) ?? [];
        const otherMember = members.find((m) => m.userId !== ctx.userId);
        const lastMessage = lastMsgByConvo.get(convoId) ?? null;
        const currentMember = members.find((m) => m.userId === ctx.userId);
        const lastReadMessageId = currentMember?.lastReadMessageId ?? 0;
        const unreadCount = lastMessages.filter(
          (message) =>
            message.conversationId === convoId &&
            message.senderId !== ctx.userId &&
            message.id > lastReadMessageId,
        ).length;
        return {
          id: convoId,
          type: "direct" as const,
          otherUser: otherMember
            ? {
                username: otherMember.username,
                displayName: otherMember.displayName,
                avatarUrl: otherMember.avatarUrl,
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
      const members = await db
        .select({
          userId: conversationMembers.userId,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(conversationMembers)
        .innerJoin(users, eq(conversationMembers.userId, users.id))
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            isNull(conversationMembers.leftAt),
          ),
        );

      const otherMember = members.find((m) => m.userId !== ctx.userId);
      return {
        otherUser: otherMember
          ? {
              username: otherMember.username,
              displayName: otherMember.displayName,
              avatarUrl: otherMember.avatarUrl,
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
          ),
        );

      const existingConvoIds = existing.map((r) => r.conversationId);
      if (existingConvoIds.length > 0) {
        const directConvos = await db
          .select({
            conversationId: conversationMembers.conversationId,
          })
          .from(conversationMembers)
          .where(
            and(
              sql`${conversationMembers.conversationId} IN ${existingConvoIds}`,
              eq(conversationMembers.userId, input.targetUserId),
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
        { conversationId: convo.id, userId: ctx.userId },
        { conversationId: convo.id, userId: input.targetUserId },
      ]);

      return { conversationId: convo.id };
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
          createdAt: messages.createdAt,
          username: users.username,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(messages.createdAt);
    }),

  deleteMessage: protectedProcedure
    .input(z.object({ conversationId: z.number(), messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const rows = await db
        .select({ id: messages.id, senderId: messages.senderId })
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
    .input(z.object({ conversationId: z.number(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertConversationMember(ctx.userId, input.conversationId);
      const [inserted] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: ctx.userId,
          body: input.body,
        })
        .returning({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
          deletedAt: messages.deletedAt,
        });

      const [msg] = await db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
          username: users.username,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.id, inserted.id))
        .limit(1);

      await pusherServer.trigger(
        `private-conversation-${input.conversationId}`,
        "message.created",
        msg,
      );

      return msg;
    }),
} satisfies TRPCRouterRecord;

async function assertConversationMember(
  userId: number,
  conversationId: number,
) {
  const member = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
        isNull(conversationMembers.leftAt),
      ),
    )
    .limit(1);

  if (!member[0]) throw new Error("Not a member of this conversation");
}
