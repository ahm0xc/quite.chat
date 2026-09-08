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

        if (typeof socketId !== "string") {
          return new Response("Bad request", { status: 400 });
        }

        const localUser = await getLocalUser(session.userId);
        if (!localUser) return new Response("Forbidden", { status: 403 });

        if (channelName === "presence-global") {
          return Response.json(
            pusherServer.authorizeChannel(socketId, channelName, {
              user_id: String(localUser.id),
              user_info: {
                userId: localUser.id,
                status: localUser.presenceStatus,
              },
            }),
          );
        }

        const conversationId = channelName.match(
          /^private-conversation-(\d+)$/,
        )?.[1];

        if (!conversationId) {
          return new Response("Bad request", { status: 400 });
        }

        const member = await db
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, Number(conversationId)),
              eq(conversationMembers.userId, localUser.id),
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

async function getLocalUser(clerkUserId: string) {
  const rows = await db
    .select({ id: users.id, presenceStatus: users.presenceStatus })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (rows.length === 0 || !rows[0]) return null;
  return rows[0];
}
