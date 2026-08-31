import { z } from "zod";
import { ilike, and, isNull, ne } from "drizzle-orm";
import { protectedProcedure } from "../init";
import { db } from "~/db";
import { users } from "~/db/schema";

import type { TRPCRouterRecord } from "@trpc/server";

export const usersRouter = {
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(
          and(
            ilike(users.username, `%${input.query}%`),
            ne(users.id, ctx.userId),
            isNull(users.deletedAt),
          ),
        )
        .limit(20);
    }),
} satisfies TRPCRouterRecord;
