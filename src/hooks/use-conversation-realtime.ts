import Pusher from "pusher-js";
import { useEffect } from "react";

import { env } from "~/env";
import { upsertMessages } from "~/lib/local-db";

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

type MessageEvent = {
  id: number;
  body: string;
  senderId: number;
  createdAt: string | Date;
  username: string | null;
};
