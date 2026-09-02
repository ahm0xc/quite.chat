import { useAuth } from "@clerk/tanstack-react-start";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";

import { Composer } from "~/components/composer";
import { MessageBubble } from "~/components/message-bubble";
import type { UIMessage } from "~/components/message-bubble";
import { Button } from "~/components/ui/button";
import { useConversationRealtime } from "~/hooks/use-conversation-realtime";
import { useMessageScroll } from "~/hooks/use-message-scroll";
import { useTRPC } from "~/integrations/trpc/react";
import {
  localDb,
  markLocalMessageDeleted,
  upsertMessages,
  upsertUsers,
} from "~/lib/local-db";
import { syncMessages } from "~/lib/local-sync";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_app/c/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const [body, setBody] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<
    Array<UIMessage>
  >([]);
  const [optimisticallyDeletedIds, setOptimisticallyDeletedIds] = useState<
    Set<number>
  >(new Set());

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();

  const me = useQuery({
    ...trpc.users.me.queryOptions(),
    enabled: isLoaded && isSignedIn === true,
  });
  const convoId = Number(conversationId);
  const messages = useQuery({
    ...trpc.conversations.messages.queryOptions({ conversationId: convoId }),
    enabled: isLoaded && isSignedIn === true,
  });
  const { mutate: markRead } = useMutation(
    trpc.conversations.markRead.mutationOptions(),
  );
  const latestMessageRef = useRef<HTMLLIElement>(null);
  const localMessages = useLiveQuery(
    () =>
      localDb.messages
        .where("conversationId")
        .equals(convoId)
        .sortBy("createdAt"),
    [convoId],
  );
  const cachedUsers = useLiveQuery(() => localDb.users.toArray(), []);
  const usernames = [
    ...new Set(
      [...(localMessages ?? []), ...(messages.data ?? [])]
        .map((message) => message.username)
        .filter((username): username is string => Boolean(username)),
    ),
  ];
  const missingUsernames = usernames.filter(
    (username) => !cachedUsers?.some((user) => user.username === username),
  );
  const usersByUsername = useQuery({
    ...trpc.users.getByUsernames.queryOptions({ usernames: missingUsernames }),
    enabled: isLoaded && isSignedIn === true && missingUsernames.length > 0,
  });
  useEffect(() => {
    if (usersByUsername.data?.length) void upsertUsers(usersByUsername.data);
  }, [usersByUsername.data]);
  useEffect(() => {
    if (messages.data)
      void syncMessages(
        messages.data.map((message) => ({
          ...message,
          conversationId: convoId,
        })),
      );
  }, [messages.data, convoId]);
  useConversationRealtime(convoId);

  const send = useMutation(
    trpc.conversations.sendMessage.mutationOptions({
      onSuccess: (message, variables) => {
        setOptimisticMessages((current) =>
          current.filter((item) => item.body !== variables.body),
        );
        queryClient.setQueryData(
          trpc.conversations.messages.queryKey({ conversationId: convoId }),
          (current) => {
            if (!current?.some((item) => item.id === message.id)) {
              return [...(current ?? []), message];
            }
            return current;
          },
        );
        void upsertMessages([{ ...message, conversationId: convoId }]);
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
      },
      onError: (_error, variables) => {
        setOptimisticMessages((current) =>
          current.map((item) =>
            item.body === variables.body ? { ...item, status: "failed" } : item,
          ),
        );
      },
    }),
  );

  const deleteMessage = useMutation(
    trpc.conversations.deleteMessage.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries({
          queryKey: trpc.conversations.messages.queryKey({
            conversationId: convoId,
          }),
        });
        const previousMessages = queryClient.getQueryData(
          trpc.conversations.messages.queryKey({ conversationId: convoId }),
        );
        const previousOptimistic = [...optimisticMessages];
        const previousDeletedIds = new Set(optimisticallyDeletedIds);
        const localPrevPromise = localDb.messages.get(variables.messageId);
        const deletedAt = new Date();
        setOptimisticallyDeletedIds((prev) => {
          const next = new Set(prev);
          next.add(variables.messageId);
          return next;
        });
        queryClient.setQueryData(
          trpc.conversations.messages.queryKey({ conversationId: convoId }),
          (current) =>
            current?.map((m) =>
              m.id === variables.messageId ? { ...m, deletedAt, body: "" } : m,
            ) ?? current,
        );
        setOptimisticMessages((current) =>
          current.map((m) =>
            m.id === variables.messageId ? { ...m, deletedAt, body: "" } : m,
          ),
        );
        void markLocalMessageDeleted(variables.messageId);
        const localPrev = await localPrevPromise;
        return {
          previousMessages,
          previousOptimistic,
          previousDeletedIds,
          localPrev,
        };
      },
      onError: (_error, _variables, context) => {
        if (context?.previousMessages) {
          queryClient.setQueryData(
            trpc.conversations.messages.queryKey({ conversationId: convoId }),
            context.previousMessages,
          );
        }
        if (context?.previousOptimistic) {
          setOptimisticMessages(context.previousOptimistic);
        }
        if (context?.previousDeletedIds) {
          setOptimisticallyDeletedIds(context.previousDeletedIds);
        }
        if (context?.localPrev) {
          void localDb.messages.put(context.localPrev);
        }
      },
      onSettled: () => {
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
      },
    }),
  );

  const handleSend = (value = body) => {
    const messageBody = value.trim();
    if (!messageBody) return;
    setOptimisticMessages((current) => [
      ...current,
      {
        id: `temp-${Math.random().toString(36).slice(2)}`,
        conversationId: convoId,
        body: messageBody,
        senderId: me.data?.id ?? 0,
        createdAt: new Date(),
        username: me.data?.username ?? null,
        status: "sending",
        deletedAt: null,
      },
    ]);
    send.mutate({ conversationId: convoId, body: messageBody });
    setBody("");
  };

  const baseMessages = (
    localMessages?.length ? localMessages : (messages.data ?? [])
  ).map((m) =>
    optimisticallyDeletedIds.has(m.id)
      ? { ...m, deletedAt: new Date(), body: "" }
      : m,
  );
  const renderedMessages = [...baseMessages, ...optimisticMessages];
  const users = [...(cachedUsers ?? []), ...(usersByUsername.data ?? [])];
  const latestMessage = [...renderedMessages]
    .reverse()
    .find((message) => typeof message.id === "number");
  const { hasNewMessages, messagesListRef, rowVirtualizer, scrollToLatest } =
    useMessageScroll(renderedMessages.length);
  useEffect(() => {
    const message = latestMessage;
    const element = latestMessageRef.current;
    const list = messagesListRef.current;
    if (!message || !element || !list) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && isLoaded && isSignedIn === true) {
          markRead({
            conversationId: convoId,
            messageId: message.id as number,
          });
        }
      },
      { root: list, threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [convoId, isLoaded, isSignedIn, latestMessage, markRead, messagesListRef]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ConvoHeader conversationId={conversationId} />

      <ul
        ref={messagesListRef}
        className="relative min-h-0 w-full flex-1 overflow-y-scroll pt-4 pb-6"
      >
        <div
          className="relative min-h-full w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const msg = renderedMessages[virtualRow.index];
            return (
              <li
                key={msg.id}
                data-index={virtualRow.index}
                ref={(element) => {
                  rowVirtualizer.measureElement(element);
                  if (msg.id === latestMessage?.id)
                    latestMessageRef.current = element;
                }}
                className={cn(
                  "absolute top-0 left-0 flex w-full pb-8",
                  "justify-start",
                )}
                style={{
                  top: `max(0px, calc(100% - ${rowVirtualizer.getTotalSize()}px))`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MessageBubble
                  message={msg}
                  sender={users.find((user) => user.id === msg.senderId)}
                  isOwnMessage={me.data?.id === msg.senderId}
                  onDelete={(messageId) =>
                    deleteMessage.mutate({
                      conversationId: convoId,
                      messageId,
                    })
                  }
                />
              </li>
            );
          })}
        </div>
      </ul>

      <div className="relative flex gap-2 border-t p-4">
        {hasNewMessages && (
          <Button
            type="button"
            variant="secondary"
            className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2 gap-2 rounded-full shadow-md"
            onClick={scrollToLatest}
          >
            <ArrowDownIcon />
            New messages
          </Button>
        )}
        <Composer
          onChange={setBody}
          onSubmit={handleSend}
          disabled={send.isPending}
        />
        <Button
          type="button"
          size="icon"
          className="h-10 w-10"
          onClick={() => handleSend()}
          disabled={send.isPending || !body.trim()}
        >
          <ArrowUpIcon />
        </Button>
      </div>
    </div>
  );
}

function ConvoHeader({ conversationId }: { conversationId: string }) {
  const trpc = useTRPC();
  const { isLoaded, isSignedIn } = useAuth();
  const details = useQuery({
    ...trpc.conversations.details.queryOptions({
      conversationId: Number(conversationId),
    }),
    enabled: isLoaded && isSignedIn === true,
  });

  const user = details.data?.otherUser;

  return (
    <div className="flex h-14 items-center gap-3 border-b px-4">
      <Link to="/" className="text-muted-foreground hover:text-foreground">
        <CaretLeftIcon className="h-5 w-5" />
      </Link>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium">
          {user?.username?.[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <h1 className="text-sm font-medium">
        {user?.displayName ?? user?.username ?? "Unknown"}
      </h1>
    </div>
  );
}
