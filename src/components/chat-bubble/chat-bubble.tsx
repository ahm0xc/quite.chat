import { Bubble, BubbleContent } from "~/components/ui/bubble";
import type { RouterOutputs } from "~/integrations/trpc/router";
import { cn } from "~/lib/utils";

export type Message = RouterOutputs["conversations"]["messages"][number];
export type UIMessage = Omit<Message, "id"> & {
  id: number | string;
  status?: "sending" | "sent" | "failed";
};

export function ChatBubble({
  message,
  sender,
  isOwnMessage,
}: {
  message: UIMessage;
  sender?: {
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  isOwnMessage: boolean;
}) {
  const senderName = sender?.displayName ?? "Unknown";
  const avatarLabel =
    (sender?.displayName ??
      sender?.username ??
      message.username)?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="ml-4 flex min-w-0 items-start gap-2">
      {sender?.avatarUrl ? (
        <img
          src={sender.avatarUrl}
          alt={`${senderName}'s avatar`}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
        >
          {avatarLabel}
        </div>
      )}

      <Bubble
        align="start"
        variant={isOwnMessage ? "default" : "secondary"}
        className={cn("mt-0.5", message.status === "sending" && "opacity-60")}
      >
        {sender?.displayName && (
          <span className="text-muted-foreground mb-0.5 text-xs leading-none">
            {sender.displayName}
          </span>
        )}

        <BubbleContent>
          {message.body}
          {message.status === "failed" && (
            <span className="text-destructive ml-2 text-xs">Failed</span>
          )}
        </BubbleContent>
      </Bubble>
    </div>
  );
}
