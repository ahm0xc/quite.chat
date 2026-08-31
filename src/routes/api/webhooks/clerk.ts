import { eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "svix";
import { db } from "~/db";
import { users } from "~/db/schema";
import { env } from "~/env";

type ClerkUserEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
};

function displayName(data: ClerkUserEvent["data"]) {
  return [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
}

export const Route = createFileRoute("/api/webhooks/clerk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.text();
        const headers = Object.fromEntries(request.headers.entries());

        let event: ClerkUserEvent;
        try {
          event = new Webhook(env.CLERK_WEBHOOK_SECRET).verify(
            payload,
            headers,
          ) as ClerkUserEvent;
        } catch {
          return new Response("Invalid webhook signature", { status: 400 });
        }

        const user = event.data;
        if (event.type === "user.deleted") {
          await db
            .update(users)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(users.clerkUserId, user.id));
        } else {
          await db
            .insert(users)
            .values({
              clerkUserId: user.id,
              username: user.username,
              displayName: displayName(user),
              avatarUrl: user.image_url,
            })
            .onConflictDoUpdate({
              target: users.clerkUserId,
              set: {
                username: user.username,
                displayName: displayName(user),
                avatarUrl: user.image_url,
                deletedAt: null,
                updatedAt: new Date(),
              },
            });
        }

        return Response.json({ received: true });
      },
    },
  },
});
