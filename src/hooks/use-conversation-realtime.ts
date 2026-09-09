import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { useTRPC } from "~/integrations/trpc/react";
import {
  localDb,
  markLocalMessageDeleted,
  stampWillExpireAt,
  updateConversationFromMessage,
  upsertMessages,
} from "~/lib/local-db";
import { getMessagePreview } from "~/lib/message-preview";
import { pusherClient as pusher } from "~/lib/pusher-client";
import { playSound } from "~/lib/sound-engine";
import { getSystemPreview } from "~/lib/system-messages";
import type { SystemMessageData } from "~/lib/system-messages";
import { drop001Sound } from "~/sounds/drop-001";

function isKickForCurrentUser(message: MessageEvent, currentUserId?: number) {
  return (
    currentUserId != null &&
    message.kind === "system" &&
    message.metadata?.type === "member_kicked" &&
    message.metadata.targetId === currentUserId
  );
}

async function removeLocalConversation(conversationId: number) {
  await localDb.conversations.delete(conversationId);
  await localDb.messages
    .where("conversationId")
    .equals(conversationId)
    .delete();
}

export function useConversationRealtime(
  conversationId: number,
  currentUserId?: number,
  muteSounds = false,
  onRemoved?: () => void,
) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  React.useEffect(() => {
    const channel = pusher.subscribe(`private-conversation-${conversationId}`);

    const onCreated = (message: MessageEvent) => {
      if (isKickForCurrentUser(message, currentUserId)) {
        void removeLocalConversation(conversationId);
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
        void queryClient.invalidateQueries(
          trpc.conversations.details.queryOptions({ conversationId }),
        );
        onRemoved?.();
        return;
      }
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
      if (message.kind === "system") {
        if (
          message.metadata?.type === "title_changed" &&
          typeof message.metadata.newTitle === "string"
        ) {
          void localDb.conversations.update(conversationId, {
            title: message.metadata.newTitle,
          });
        }
        void queryClient.invalidateQueries(
          trpc.conversations.details.queryOptions({ conversationId }),
        );
      }
    };

    const onDeleted = (data: { id: number }) => {
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
    };

    channel.bind("message.created", onCreated);
    channel.bind("message.deleted", onDeleted);

    return () => {
      channel.unbind("message.created", onCreated);
      channel.unbind("message.deleted", onDeleted);
      pusher.unsubscribe(`private-conversation-${conversationId}`);
    };
  }, [conversationId, currentUserId, muteSounds, onRemoved, queryClient, trpc]);
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
      const onCreated = (message: MessageEvent) => {
        if (isKickForCurrentUser(message, currentUserId)) {
          void removeLocalConversation(conversationId);
          void queryClient.invalidateQueries(
            trpc.conversations.list.queryOptions(),
          );
          void queryClient.invalidateQueries(
            trpc.conversations.details.queryOptions({ conversationId }),
          );
          return;
        }
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
        if (
          message.kind === "system" &&
          message.metadata?.type === "title_changed" &&
          typeof message.metadata.newTitle === "string"
        ) {
          void localDb.conversations.update(conversationId, {
            title: message.metadata.newTitle,
          });
        }
        const previewBody =
          message.kind === "system" && message.metadata
            ? (() => {
                try {
                  return getSystemPreview(
                    message.metadata as unknown as SystemMessageData,
                  );
                } catch {
                  return normalizedMessage.body;
                }
              })()
            : getMessagePreview(
                normalizedMessage.body,
                normalizedMessage.attachments,
              );
        void upsertMessages([stampWillExpireAt(normalizedMessage)]);
        void updateConversationFromMessage(
          conversationId,
          {
            ...normalizedMessage,
            body: previewBody,
          },
          conversationId !== currentConversationId &&
            message.senderId !== currentUserId,
        );
      };
      const onDeleted = (data: { id: number }) => {
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
      };
      channel.bind("message.created", onCreated);
      channel.bind("message.deleted", onDeleted);
      return { channel, conversationId, onCreated, onDeleted };
    });
    return () => {
      for (const {
        channel,
        conversationId,
        onCreated,
        onDeleted,
      } of channels) {
        channel.unbind("message.created", onCreated);
        channel.unbind("message.deleted", onDeleted);
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
  senderId: number | null;
  kind?: "user" | "system";
  metadata?: Record<string, unknown> | null;
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
