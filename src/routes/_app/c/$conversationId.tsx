import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/integrations/trpc/react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/_app/c/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const convoId = Number(conversationId);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [body, setBody] = useState("");

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
    <div className="flex min-h-screen flex-col p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <h1 className="font-heading text-lg font-semibold">
          Conversation {conversationId}
        </h1>
      </div>

      <ul className="mb-4 flex-1 space-y-2 overflow-y-auto">
        {messages.data?.map((msg) => (
          <li key={msg.id} className="text-sm">
            <span className="font-medium">{msg.username}: </span>
            {msg.body}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Input
          placeholder="Type a message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <Button onClick={handleSend} disabled={send.isPending || !body.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
