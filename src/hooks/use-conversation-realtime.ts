import { useEffect } from "react";
import Pusher from "pusher-js";
import { useQueryClient } from "@tanstack/react-query";
import { env } from "~/env";
import { useTRPC } from "~/integrations/trpc/react";

const pusher = new Pusher(env.VITE_PUSHER_KEY, {
  cluster: env.VITE_PUSHER_CLUSTER,
  channelAuthorization: {
    endpoint: "/api/pusher/auth",
    transport: "ajax",
  },
});

export function useConversationRealtime(conversationId: number) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  useEffect(() => {
    const channel = pusher.subscribe(`private-conversation-${conversationId}`);
    const messagesKey = trpc.conversations.messages.queryKey({
      conversationId,
    });

    channel.bind("message.created", (message: MessageEvent) => {
      const normalizedMessage = {
        ...message,
        createdAt: new Date(message.createdAt),
      };
      queryClient.setQueryData(messagesKey, (current) => {
        if (
          !current ||
          current.some((item) => item.id === normalizedMessage.id)
        ) {
          return current;
        }
        return [...current, normalizedMessage];
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.conversations.list.queryKey(),
      });
    });

    return () => {
      channel.unbind("message.created");
      pusher.unsubscribe(`private-conversation-${conversationId}`);
    };
  }, [conversationId, queryClient, trpc]);
}

type MessageEvent = {
  id: number;
  body: string;
  senderId: number;
  createdAt: string | Date;
  username: string | null;
};
