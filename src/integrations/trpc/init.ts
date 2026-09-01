import { auth } from "@clerk/tanstack-react-start/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";

import { db } from "~/db";
import { users } from "~/db/schema";

const t = initTRPC.create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(async ({ next }) => {
  const session = await auth({ acceptsToken: "session_token" });

  if (!session.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const results = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, session.userId))
    .limit(1);

  return next({
    ctx: {
      userId: results[0].id,
      clerkUserId: session.userId,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
