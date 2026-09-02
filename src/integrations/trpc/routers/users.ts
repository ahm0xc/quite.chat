import { TRPCError } from "@trpc/server";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db";
import { users } from "~/db/schema";

import { protectedProcedure } from "../init";

export const usersRouter = {
  me: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1)
      .then((rows) => rows[0]);
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
        })
        .from(users)
        .where(inArray(users.username, input.usernames)),
    ),
} satisfies TRPCRouterRecord;
