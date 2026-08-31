import { createTRPCRouter } from "./init";
import { conversationsRouter } from "./routers/conversations";
import { usersRouter } from "./routers/users";

import type { TRPCRouterRecord, inferRouterOutputs } from "@trpc/server";

export const trpcRouter = createTRPCRouter({
  conversations: conversationsRouter,
  users: usersRouter,
} satisfies TRPCRouterRecord);

export type TRPCRouter = typeof trpcRouter;
export type RouterOutputs = inferRouterOutputs<TRPCRouter>;
