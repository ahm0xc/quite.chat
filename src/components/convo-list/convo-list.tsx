import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@clerk/tanstack-react-start";
import { QrCodeIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import { useTRPC } from "~/integrations/trpc/react";

function formatTime(date: Date | string | null) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const diffMs = startOfToday.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays <= 0) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export function ConvoList() {
  const trpc = useTRPC();
  const conversations = useQuery(trpc.conversations.list.queryOptions());

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Chat</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" aria-label="QR code">
            <QrCodeIcon />
          </Button>
          <UserButton />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-1">
        {conversations.data?.map((convo) => (
          <Link
            key={convo.id}
            to="/c/$conversationId"
            params={{ conversationId: String(convo.id) }}
            className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent"
          >
            {convo.otherUser?.avatarUrl ? (
              <img
                src={convo.otherUser.avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {convo.otherUser?.username?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
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
