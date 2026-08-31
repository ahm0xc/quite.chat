import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/integrations/trpc/react";
import { ChatBubble } from "~/components/chat-bubble";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_app/c/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const [body, setBody] = useState("");

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const me = useQuery(trpc.users.me.queryOptions());
  const convoId = Number(conversationId);
  const messages = useQuery(
    trpc.conversations.messages.queryOptions({ conversationId: convoId }),
  );

  const send = useMutation(
    trpc.conversations.sendMessage.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.conversations.messages.queryOptions({ conversationId: convoId }),
        );
        queryClient.invalidateQueries(trpc.conversations.list.queryOptions());
      },
    }),
  );

  const handleSend = () => {
    if (!body.trim()) return;
    send.mutate({ conversationId: convoId, body: body.trim() });
    setBody("");
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ConvoHeader conversationId={conversationId} />

      <ul className="flex-1 min-h-0 flex flex-col w-full gap-8 overflow-y-scroll py-12">
        {messages.data?.map((msg) => (
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
