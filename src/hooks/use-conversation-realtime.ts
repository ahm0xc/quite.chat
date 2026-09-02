import Pusher from "pusher-js";
import { useEffect } from "react";

import { env } from "~/env";
import { updateConversationFromMessage, upsertMessages } from "~/lib/local-db";

const pusher = new Pusher(env.VITE_PUSHER_KEY, {
  cluster: env.VITE_PUSHER_CLUSTER,
  channelAuthorization: {
    endpoint: "/api/pusher/auth",
    transport: "ajax",
  },
});

export function useConversationRealtime(conversationId: number) {
  useEffect(() => {
    const channel = pusher.subscribe(`private-conversation-${conversationId}`);

    channel.bind("message.created", (message: MessageEvent) => {
      const normalizedMessage = {
        ...message,
        createdAt: new Date(message.createdAt),
      };
      void upsertMessages([{ ...normalizedMessage, conversationId }]);
    });

    return () => {
      channel.unbind("message.created");
      pusher.unsubscribe(`private-conversation-${conversationId}`);
    };
  }, [conversationId]);
}

export function useConversationsRealtime(
  conversationIds: Array<number>,
  currentConversationId: number | null,
  currentUserId: number | undefined,
) {
  useEffect(() => {
    const channels = conversationIds.map((conversationId) => {
      const channel = pusher.subscribe(
        `private-conversation-${conversationId}`,
      );
      channel.bind("message.created", (message: MessageEvent) => {
        const normalizedMessage = {
          ...message,
          conversationId,
          createdAt: new Date(message.createdAt),
        };
        void upsertMessages([normalizedMessage]);
        void updateConversationFromMessage(
          conversationId,
          normalizedMessage,
          conversationId !== currentConversationId &&
            message.senderId !== currentUserId,
        );
      });
      return { channel, conversationId };
    });
    return () => {
      for (const { channel, conversationId } of channels) {
        channel.unbind("message.created");
        pusher.unsubscribe(`private-conversation-${conversationId}`);
      }
    };
  }, [conversationIds, currentConversationId, currentUserId]);
}

type MessageEvent = {
  id: number;
  body: string;
  senderId: number;
  createdAt: string | Date;
  username: string | null;
};
