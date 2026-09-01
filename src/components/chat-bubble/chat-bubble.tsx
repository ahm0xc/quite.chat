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
  isOwnMessage,
  className,
}: {
  message: UIMessage;
  isOwnMessage: boolean;
  className?: string;
}) {
  return (
    <Bubble
      align={isOwnMessage ? "end" : "start"}
      variant={isOwnMessage ? "default" : "secondary"}
      className={cn(className, message.status === "sending" && "opacity-60")}
    >
      <BubbleContent>
        {message.body}
        {message.status === "failed" && (
          <span className="text-destructive ml-2 text-xs">Failed</span>
        )}
      </BubbleContent>
    </Bubble>
  );
}
