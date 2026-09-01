import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@clerk/tanstack-react-start/server";
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
        const conversationId = channelName
          ?.toString()
          .match(/^private-conversation-(\d+)$/)?.[1];

        if (typeof socketId !== "string" || !conversationId) {
          return new Response("Bad request", { status: 400 });
        }

        const member = await db
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, Number(conversationId)),
              eq(
                conversationMembers.userId,
                await getLocalUserId(session.userId),
              ),
              isNull(conversationMembers.leftAt),
            ),
          )
          .limit(1);

        if (!member[0]) return new Response("Forbidden", { status: 403 });

        return Response.json(
          pusherServer.authorizeChannel(socketId, channelName.toString()),
        );
      },
    },
  },
});

async function getLocalUserId(clerkUserId: string) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return user.id;
}
