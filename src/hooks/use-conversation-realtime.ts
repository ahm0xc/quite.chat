import { useQueryClient } from "@tanstack/react-query";
import Pusher from "pusher-js";
import { useEffect } from "react";

import { env } from "~/env";
import { useTRPC } from "~/integrations/trpc/react";
import {
  markLocalMessageDeleted,
  updateConversationFromMessage,
  upsertMessages,
} from "~/lib/local-db";
import { getMessagePreview } from "~/lib/message-preview";

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

    channel.bind("message.created", (message: MessageEvent) => {
      const normalizedMessage = {
        ...message,
        createdAt: new Date(message.createdAt),
      };
      void upsertMessages([{ ...normalizedMessage, conversationId }]);
    });

    channel.bind("message.deleted", (data: { id: number }) => {
      void markLocalMessageDeleted(data.id);
      queryClient.setQueryData(
        trpc.conversations.messages.queryKey({ conversationId }),
        (old) =>
          old
            ? old.map((m) =>
                m.id === data.id
                  ? { ...m, deletedAt: new Date(), body: "" }
                  : m,
              )
            : old,
      );
      void queryClient.invalidateQueries(
        trpc.conversations.list.queryOptions(),
      );
    });

    return () => {
      channel.unbind("message.created");
      channel.unbind("message.deleted");
      pusher.unsubscribe(`private-conversation-${conversationId}`);
    };
  }, [conversationId, queryClient, trpc]);
}

export function useConversationsRealtime(
  conversationIds: Array<number>,
  currentConversationId: number | null,
  currentUserId: number | undefined,
) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
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
          {
            ...normalizedMessage,
            body: getMessagePreview(
              normalizedMessage.body,
              normalizedMessage.attachments,
            ),
          },
          conversationId !== currentConversationId &&
            message.senderId !== currentUserId,
        );
      });
      channel.bind("message.deleted", (data: { id: number }) => {
        void markLocalMessageDeleted(data.id);
        queryClient.setQueryData(
          trpc.conversations.messages.queryKey({ conversationId }),
          (old) =>
            old
              ? old.map((m) =>
                  m.id === data.id
                    ? { ...m, deletedAt: new Date(), body: "" }
                    : m,
                )
              : old,
        );
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
      });
      return { channel, conversationId };
    });
    return () => {
      for (const { channel, conversationId } of channels) {
        channel.unbind("message.created");
        channel.unbind("message.deleted");
        pusher.unsubscribe(`private-conversation-${conversationId}`);
      }
    };
  }, [
    conversationIds,
    currentConversationId,
    currentUserId,
    queryClient,
    trpc,
  ]);
}

type MessageEvent = {
  id: number;
  body: string;
  senderId: number;
  createdAt: string | Date;
  username: string | null;
  attachments: Array<{
    id: number;
    messageId: number;
    originalName: string | null;
    mimeType: string;
    sizeBytes: number;
    metadata: Record<string, unknown> | null;
  }>;
};
