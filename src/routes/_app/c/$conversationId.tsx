import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ChatBubble } from "~/components/chat-bubble";
import type { UIMessage } from "~/components/chat-bubble";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useConversationRealtime } from "~/hooks/use-conversation-realtime";
import { useMessageScroll } from "~/hooks/use-message-scroll";
import { useTRPC } from "~/integrations/trpc/react";
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

  const me = useQuery(trpc.users.me.queryOptions());
  const convoId = Number(conversationId);
  const messages = useQuery(
    trpc.conversations.messages.queryOptions({ conversationId: convoId }),
  );
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
        username: null,
        status: "sending",
      },
    ]);
    send.mutate({ conversationId: convoId, body: messageBody });
    setBody("");
  };

  const renderedMessages = [...(messages.data ?? []), ...optimisticMessages];
  const { hasNewMessages, messagesEndRef, messagesListRef, scrollToLatest } =
    useMessageScroll(renderedMessages.length);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ConvoHeader conversationId={conversationId} />

      <ul
        ref={messagesListRef}
        className="relative flex min-h-0 w-full flex-1 flex-col gap-8 overflow-y-scroll pt-12 pb-6"
      >
        {renderedMessages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            isOwnMessage={me.data?.id === msg.senderId}
            className={cn("", me.data?.id === msg.senderId ? "mr-4" : "ml-4")}
          />
        ))}
        <li ref={messagesEndRef} aria-hidden="true" className="h-px shrink-0" />
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
  const details = useQuery(
    trpc.conversations.details.queryOptions({
      conversationId: Number(conversationId),
    }),
  );

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
