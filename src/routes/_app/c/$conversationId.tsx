import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/integrations/trpc/react";
import { ChatBubble } from "~/components/chat-bubble";
import type { UIMessage } from "~/components/chat-bubble";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { cn } from "~/lib/utils";
import { useConversationRealtime } from "~/hooks/use-conversation-realtime";

export const Route = createFileRoute("/_app/c/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const [body, setBody] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<UIMessage[]>([]);

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
        queryClient.invalidateQueries(trpc.conversations.list.queryOptions());
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
        id: `temp-${crypto.randomUUID()}`,
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ConvoHeader conversationId={conversationId} />

      <ul className="flex-1 min-h-0 flex flex-col w-full gap-8 overflow-y-scroll py-12">
        {[...(messages.data ?? []), ...optimisticMessages].map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            isOwnMessage={me.data?.id === msg.senderId}
            className={cn("", me.data?.id === msg.senderId ? "mr-4" : "ml-4")}
          />
        ))}
      </ul>

      <div className="flex gap-2 p-4 border-t">
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
    <div className="flex items-center gap-3 h-14 border-b px-4">
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
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
          {user?.username?.[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <h1 className="text-sm font-medium">
        {user?.displayName ?? user?.username ?? "Unknown"}
      </h1>
    </div>
  );
}
