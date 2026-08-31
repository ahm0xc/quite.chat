import type { RouterOutputs } from "~/integrations/trpc/router";
import { Bubble, BubbleContent } from "~/components/ui/bubble";
import { cn } from "~/lib/utils";

export type Message = RouterOutputs["conversations"]["messages"][number];

export function ChatBubble({
  message,
  isOwnMessage,
  className,
}: {
  message: Message;
  isOwnMessage: boolean;
  className?: string;
}) {
  return (
    <Bubble
      align={isOwnMessage ? "end" : "start"}
      variant={isOwnMessage ? "default" : "secondary"}
      className={cn(className)}
    >
      <BubbleContent>{message.body}</BubbleContent>
    </Bubble>
  );
}
