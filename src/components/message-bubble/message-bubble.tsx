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
import type { LocalMessage } from "~/lib/local-db";
import { cn } from "~/lib/utils";

export type Message = RouterOutputs["conversations"]["messages"][number];
export type UIMessage = Omit<Message, "id" | "deletedAt"> & {
  id: number | string;
  deletedAt?: Date | string | null;
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
  onDelete,
}: {
  message: UIMessage | LocalMessage;
  sender?: {
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  isOwnMessage: boolean;
  onDelete?: (messageId: number) => void;
}) {
  const isDeleted = Boolean(
    (message as { deletedAt?: Date | string | null }).deletedAt,
  );
  const senderName = sender?.displayName ?? "Unknown";
  const avatarLabel =
    (sender?.displayName ??
      sender?.username ??
      message.username)?.[0]?.toUpperCase() ?? "?";

  const bubble = (
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
          (message as UIMessage).status === "sending" && "opacity-60",
          isDeleted && "opacity-70",
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
          {isDeleted ? (
            <span className="text-muted-foreground wrap-break-words whitespace-pre-wrap italic">
              This message was deleted
            </span>
          ) : (
            <span className="wrap-break-words whitespace-pre-wrap">
              {message.body}
            </span>
          )}
          {(message as UIMessage).status === "failed" && (
            <span className="text-destructive ml-2 text-xs">Failed</span>
          )}
        </BubbleContent>
      </Bubble>
    </div>
  );

  if (isDeleted) return bubble;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block">{bubble}</ContextMenuTrigger>
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
        {isOwnMessage && typeof message.id === "number" && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onClick={() => onDelete(message.id as number)}
            >
              <TrashIcon />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
