import {
  ArrowBendUpLeftIcon,
  CopyIcon,
  PushPinIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { Bubble, BubbleContent } from "~/components/ui/bubble";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import type { RouterOutputs } from "~/integrations/trpc/router";
import { cn } from "~/lib/utils";

export type Message = RouterOutputs["conversations"]["messages"][number];
export type UIMessage = Omit<Message, "id"> & {
  id: number | string;
  status?: "sending" | "sent" | "failed";
};

function formatMessageTime(value: Date | string | number | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return time;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${time} ${dd}/${mm}/${yy}`;
}

export function MessageBubble({
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
    <ContextMenu>
      <ContextMenuTrigger className="block">
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
            className={cn(
              "mt-0.5",
              message.status === "sending" && "opacity-60",
            )}
          >
            <span className="text-muted-foreground mb-0.5 flex items-baseline gap-1.5 text-xs leading-none whitespace-nowrap">
              {sender?.displayName && (
                <span className="shrink-0 whitespace-nowrap">
                  {sender.displayName}
                </span>
              )}
              <span className="text-muted-foreground/70 shrink-0 whitespace-nowrap">
                {formatMessageTime(message.createdAt)}
              </span>
            </span>

            <BubbleContent>
              <span className="wrap-break-words whitespace-pre-wrap">
                {message.body}
              </span>
              {message.status === "failed" && (
                <span className="text-destructive ml-2 text-xs">Failed</span>
              )}
            </BubbleContent>
          </Bubble>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>
          <ArrowBendUpLeftIcon />
          Reply
        </ContextMenuItem>
        <ContextMenuItem>
          <CopyIcon />
          Copy
        </ContextMenuItem>
        <ContextMenuItem>
          <PushPinIcon />
          Pin
        </ContextMenuItem>
        {isOwnMessage && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive">
              <TrashIcon />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
