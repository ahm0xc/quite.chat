import { MinusCircleIcon } from "@phosphor-icons/react/dist/csr/MinusCircle";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { PRESENCE_META } from "~/hooks/use-presence";
import type { PresenceStatus } from "~/hooks/use-presence";
import { cn } from "~/lib/utils";

const indicatorVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full bg-background [&_svg]:size-full",
  {
    variants: {
      size: {
        sm: "size-2.5",
        md: "size-3",
        lg: "size-3.5",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

type PresenceIndicatorProps = {
  status: PresenceStatus;
  className?: string;
} & VariantProps<typeof indicatorVariants>;

export function PresenceIndicator({
  status,
  size = "md",
  className,
}: PresenceIndicatorProps) {
  return (
    <span
      aria-label={`Status: ${PRESENCE_META[status].label}`}
      className={cn(indicatorVariants({ size }), className)}
    >
      {status === "away" ? (
        <MoonIcon weight="fill" className="text-yellow-400" />
      ) : status === "dnd" ? (
        <MinusCircleIcon weight="fill" className="text-red-500" />
      ) : (
        <span
          className={cn(
            "size-[70%] rounded-full",
            status === "online" ? "bg-green-500" : "bg-muted-foreground/50",
          )}
        />
      )}
    </span>
  );
}
