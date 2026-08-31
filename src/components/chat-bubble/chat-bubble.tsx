import type { RouterOutputs } from "~/integrations/trpc/router";

export type Message = RouterOutputs["conversations"]["messages"][number];

export function ChatBubble({ message }: { message: Message }) {
  return (
    <li className="text-sm">
      <span className="font-medium">{message.username}: </span>
      {message.body}
    </li>
  );
}
