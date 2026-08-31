import { z } from "zod";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { protectedProcedure } from "../init";
import { db } from "~/db";
import {
  users,
  conversations,
  conversationMembers,
  messages,
} from "~/db/schema";

import type { TRPCRouterRecord } from "@trpc/server";

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
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(sql`${conversationMembers.conversationId} IN ${convoIds}`);

    const lastMessages = await db
      .select({
        conversationId: messages.conversationId,
        body: messages.body,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
      })
      .from(messages)
      .where(sql`${messages.conversationId} IN ${convoIds}`)
      .orderBy(desc(messages.createdAt));

    const lastMsgByConvo = new Map<
      number,
      { body: string; createdAt: Date; senderId: number }
    >();
    for (const msg of lastMessages) {
      if (!lastMsgByConvo.has(msg.conversationId)) {
        lastMsgByConvo.set(msg.conversationId, {
          body: msg.body,
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
    .query(async ({ input }) => {
      return db
        .select({
          id: messages.id,
          body: messages.body,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
          username: users.username,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(messages.createdAt);
    }),

  sendMessage: protectedProcedure
    .input(z.object({ conversationId: z.number(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [msg] = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: ctx.userId,
          body: input.body,
        })
        .returning({ id: messages.id });

      return { id: msg.id };
    }),
} satisfies TRPCRouterRecord;
