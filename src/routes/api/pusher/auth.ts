import { auth } from "@clerk/tanstack-react-start/server";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "~/db";
import { conversationMembers, users } from "~/db/schema";
import { pusherServer } from "~/lib/pusher-server";

export const Route = createFileRoute("/api/pusher/auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth({ acceptsToken: "session_token" });
        if (!session.userId)
          return new Response("Unauthorized", { status: 401 });

        const form = await request.formData();
        const socketId = form.get("socket_id");
        const channelName = form.get("channel_name");
        if (typeof channelName !== "string") {
          return new Response("Bad request", { status: 400 });
        }
        const conversationId = channelName.match(
          /^private-conversation-(\d+)$/,
        )?.[1];

        if (typeof socketId !== "string" || !conversationId) {
          return new Response("Bad request", { status: 400 });
        }

        const localUserId = await getLocalUserId(session.userId);
        if (!localUserId) return new Response("Forbidden", { status: 403 });

        const member = await db
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, Number(conversationId)),
              eq(conversationMembers.userId, localUserId),
              isNull(conversationMembers.leftAt),
            ),
          )
          .limit(1);

        if (!member[0]) return new Response("Forbidden", { status: 403 });

        return Response.json(
          pusherServer.authorizeChannel(socketId, channelName),
        );
      },
    },
  },
});

async function getLocalUserId(clerkUserId: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0].id;
}
