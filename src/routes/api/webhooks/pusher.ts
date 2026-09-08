import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "~/db";
import { users } from "~/db/schema";
import { setUserPresence } from "~/integrations/trpc/routers/users";
import { pusherServer } from "~/lib/pusher-server";

export const Route = createFileRoute("/api/webhooks/pusher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const headers = Object.fromEntries(request.headers.entries());

        let webhook: ReturnType<typeof pusherServer.webhook>;
        try {
          webhook = pusherServer.webhook({ headers, rawBody });
        } catch {
          return new Response("Invalid webhook", { status: 400 });
        }
        if (!webhook.isValid()) {
          return new Response("Invalid signature", { status: 401 });
        }

        for (const event of webhook.getEvents()) {
          if (event.channel !== "presence-global") continue;
          let userId: number | null = null;
          try {
            const data = JSON.parse(event.data) as { user_id?: unknown };
            const parsed =
              typeof data.user_id === "string"
                ? Number(data.user_id)
                : typeof data.user_id === "number"
                  ? data.user_id
                  : NaN;
            if (Number.isInteger(parsed)) userId = parsed;
          } catch {
            continue;
          }
          if (userId === null) continue;

          if (event.name === "member_removed") {
            await setUserPresence(userId, "offline");
          } else if (event.name === "member_added") {
            await db
              .update(users)
              .set({ lastSeenAt: new Date(), updatedAt: new Date() })
              .where(eq(users.id, userId));
          }
        }

        return Response.json({ received: true });
      },
    },
  },
});
