import { useAuth } from "@clerk/tanstack-react-start";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";

import { ChatBubble } from "~/components/chat-bubble";
import type { UIMessage } from "~/components/chat-bubble";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useConversationRealtime } from "~/hooks/use-conversation-realtime";
import { useMessageScroll } from "~/hooks/use-message-scroll";
import { useTRPC } from "~/integrations/trpc/react";
import { localDb, upsertMessages, upsertUsers } from "~/lib/local-db";
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

  const handleSend = () => {
    if (!body.trim()) return;
    const messageBody = body.trim();
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
      },
    ]);
    send.mutate({ conversationId: convoId, body: messageBody });
    setBody("");
  };

  const renderedMessages = [
    ...(localMessages?.length ? localMessages : (messages.data ?? [])),
    ...optimisticMessages,
  ];
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
          className="relative w-full"
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
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <ChatBubble
                  message={msg}
                  sender={users.find((user) => user.id === msg.senderId)}
                  isOwnMessage={me.data?.id === msg.senderId}
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
        <Input
          placeholder="Type a message..."
          className="h-10"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          autoComplete="off"
        />
        <Button
          size="icon"
          className="h-10 w-10"
          onClick={handleSend}
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
