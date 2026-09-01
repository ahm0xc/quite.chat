import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";

import { db } from "~/db";
import { users } from "~/db/schema";

import { protectedProcedure } from "../init";

export const usersRouter = {
  me: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1)
      .then((rows) => rows[0]);
  }),
} satisfies TRPCRouterRecord;
