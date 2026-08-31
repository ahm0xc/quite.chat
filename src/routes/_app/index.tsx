import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@clerk/tanstack-react-start";
import { useTRPC } from "~/integrations/trpc/react";

export const Route = createFileRoute("/_app/")({ component: HomePage });

function formatTime(date: Date | string | null) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function HomePage() {
  const trpc = useTRPC();
  const conversations = useQuery(trpc.conversations.list.queryOptions());

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Chat</h1>
        <UserButton />
      </div>

      <Link
        to="/search"
        className="mt-6 block rounded-md border bg-muted px-4 py-3 text-muted-foreground transition-colors hover:bg-accent"
      >
        Search users...
      </Link>

      <div className="mt-6 flex flex-col gap-1">
        {conversations.data?.map((convo) => (
          <Link
            key={convo.id}
            to="/c/$conversationId"
            params={{ conversationId: String(convo.id) }}
            className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {convo.otherUser?.username?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium">
                  {convo.otherUser?.displayName ??
                    convo.otherUser?.username ??
                    "Unknown"}
                </span>
                {convo.lastMessage && (
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {formatTime(convo.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              {convo.lastMessage && (
                <p className="truncate text-sm text-muted-foreground">
                  {convo.lastMessage.body}
                </p>
              )}
            </div>
          </Link>
        ))}
        {conversations.data?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No conversations yet. Search for users to start chatting.
          </p>
        )}
      </div>
    </div>
  );
}
