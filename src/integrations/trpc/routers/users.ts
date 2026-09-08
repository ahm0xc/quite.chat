import { TRPCError } from "@trpc/server";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { users } from "~/db/schema";
import { pusherServer } from "~/lib/pusher-server";

import { protectedProcedure } from "../init";

export const settablePresenceStatus = z.enum(["online", "away", "dnd"]);
export type SettablePresenceStatus = z.infer<typeof settablePresenceStatus>;

export async function setUserPresence(
  userId: number,
  status: "online" | "away" | "dnd" | "offline",
) {
  await db
    .update(users)
    .set({
      presenceStatus: status,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  try {
    await pusherServer.trigger("presence-global", "presence.updated", {
      userId,
      status,
    });
  } catch (error) {
    console.error("Failed to publish presence.updated event", error);
  }
}

export const usersRouter = {
  me: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        presenceStatus: users.presenceStatus,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1)
      .then((rows) => rows[0]);
  }),

  setStatus: protectedProcedure
    .input(z.object({ status: settablePresenceStatus }))
    .mutation(async ({ ctx, input }) => {
      await setUserPresence(ctx.userId, input.status);
      return { status: input.status };
    }),

  goOffline: protectedProcedure.mutation(async ({ ctx }) => {
    await setUserPresence(ctx.userId, "offline");
    return { status: "offline" as const };
  }),

  getByUsername: protectedProcedure
    .input(
      z.object({
        username: z
          .string()
          .trim()
          .min(1)
          .transform((s) => s.replace(/^@+/, "").trim()),
      }),
    )
    .query(async ({ input }) => {
      const username = input.username.trim().replace(/^@+/, "").trim();
      if (!username) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          presenceStatus: users.presenceStatus,
        })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username})`)
        .limit(1);

      if (rows.length === 0 || !rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return rows[0];
    }),

  getByUsernames: protectedProcedure
    .input(z.object({ usernames: z.array(z.string()).min(1) }))
    .query(({ input }) =>
      db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          presenceStatus: users.presenceStatus,
        })
        .from(users)
        .where(inArray(users.username, input.usernames)),
    ),
} satisfies TRPCRouterRecord;
