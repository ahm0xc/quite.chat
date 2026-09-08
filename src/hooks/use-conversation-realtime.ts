import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { useTRPC } from "~/integrations/trpc/react";
import {
  markLocalMessageDeleted,
  stampWillExpireAt,
  updateConversationFromMessage,
  upsertMessages,
} from "~/lib/local-db";
import { getMessagePreview } from "~/lib/message-preview";
import { pusherClient as pusher } from "~/lib/pusher-client";
import { playSound } from "~/lib/sound-engine";
import { drop001Sound } from "~/sounds/drop-001";

export function useConversationRealtime(
  conversationId: number,
  currentUserId?: number,
  muteSounds = false,
) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  React.useEffect(() => {
    const channel = pusher.subscribe(`private-conversation-${conversationId}`);

    channel.bind("message.created", (message: MessageEvent) => {
      if (
        !muteSounds &&
        message.senderId !== currentUserId &&
        (document.hidden || !document.hasFocus())
      ) {
        void playSound(drop001Sound.dataUri, { volume: 0.8 }).catch(() => {});
      }
      const stamped = stampWillExpireAt({
        ...message,
        conversationId,
        createdAt: new Date(message.createdAt),
      });
      void upsertMessages([stamped]);
      queryClient.setQueryData(
        trpc.conversations.messages.queryKey({ conversationId }),
        (old) => {
          if (!old) return old;
          if (old.some((m) => m.id === message.id)) return old;
          return [...old, stamped as unknown as (typeof old)[number]];
        },
      );
      void queryClient.invalidateQueries(
        trpc.conversations.list.queryOptions(),
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

    return () => {
      channel.unbind("message.created");
      channel.unbind("message.deleted");
      pusher.unsubscribe(`private-conversation-${conversationId}`);
    };
  }, [conversationId, currentUserId, muteSounds, queryClient, trpc]);
}

export function useConversationsRealtime(
  conversationIds: Array<number>,
  currentConversationId: number | null,
  currentUserId: number | undefined,
  muteSounds = false,
) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  React.useEffect(() => {
    const channels = conversationIds.map((conversationId) => {
      const channel = pusher.subscribe(
        `private-conversation-${conversationId}`,
      );
      channel.bind("message.created", (message: MessageEvent) => {
        if (
          !muteSounds &&
          conversationId !== currentConversationId &&
          message.senderId !== currentUserId
        ) {
          void playSound(drop001Sound.dataUri, { volume: 0.8 }).catch(() => {});
        }
        const normalizedMessage = {
          ...message,
          conversationId,
          createdAt: new Date(message.createdAt),
        };
        void upsertMessages([stampWillExpireAt(normalizedMessage)]);
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
    muteSounds,
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
    objectKey?: string;
    url?: string;
  }>;
};
