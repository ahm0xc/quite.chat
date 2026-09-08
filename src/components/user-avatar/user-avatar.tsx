import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { useLiveQuery } from "dexie-react-hooks";
import * as React from "react";

import { usePresenceOf } from "~/hooks/use-presence";
import { useTRPC } from "~/integrations/trpc/react";
import { localDb, upsertUsers } from "~/lib/local-db";
import { cn } from "~/lib/utils";

import { PresenceIndicator } from "./presence-indicator";

const avatarVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium select-none",
  {
    variants: {
      size: {
        sm: "size-8 text-xs",
        md: "size-10 text-sm",
        lg: "size-12 text-base",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

type UserAvatarProps = {
  userId?: number;
  username?: string | null;
  showPresence?: boolean;
  className?: string;
} & VariantProps<typeof avatarVariants>;

export function UserAvatar({
  userId,
  username,
  showPresence = false,
  size = "md",
  className,
}: UserAvatarProps) {
  const trimmedUsername = username?.replace(/^@+/, "").trim() ?? "";
  const [failedAvatarUrl, setFailedAvatarUrl] = React.useState<string | null>(
    null,
  );

  const { isLoaded, isSignedIn } = useAuth();
  const trpc = useTRPC();
  const userById = useQuery({
    ...trpc.users.getById.queryOptions({ id: userId ?? 0 }),
    enabled: isLoaded && isSignedIn === true && userId != null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const userByUsername = useQuery({
    ...trpc.users.getByUsername.queryOptions({
      username: trimmedUsername || "_",
    }),
    enabled:
      isLoaded &&
      isSignedIn === true &&
      userId == null &&
      trimmedUsername.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const localUser = useLiveQuery(() => {
    if (userId != null) return localDb.users.get(userId);
    if (trimmedUsername.length > 0) {
      const needle = trimmedUsername.toLowerCase();
      return localDb.users
        .filter((user) => user.username?.toLowerCase() === needle)
        .first();
    }
    return undefined;
  }, [userId, trimmedUsername]);
  const presence = usePresenceOf(
    userById.data?.id ?? userByUsername.data?.id ?? localUser?.id ?? userId,
    userById.data?.presenceStatus ??
      userByUsername.data?.presenceStatus ??
      "offline",
  );

  React.useEffect(() => {
    const fetched = userById.data ?? userByUsername.data;
    if (fetched) void upsertUsers([fetched]);
  }, [userById.data, userByUsername.data]);

  const user = userById.data ?? userByUsername.data ?? localUser;
  const avatarUrl = user?.avatarUrl ?? null;
  const showImage = Boolean(avatarUrl) && failedAvatarUrl !== avatarUrl;
  const initialSource = user?.displayName ?? user?.username ?? trimmedUsername;
  const initial = initialSource.charAt(0).toUpperCase() || "?";
  const displayName = user?.displayName ?? user?.username;
  const alt = displayName ? `${displayName}'s avatar` : "User avatar";
  const hasIdentifier = userId != null || trimmedUsername.length > 0;
  const isQueryPending =
    userId != null ? userById.isPending : userByUsername.isPending;
  const isLoading = !user && (!hasIdentifier || isQueryPending);

  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          avatarVariants({ size }),
          isLoading && "animate-pulse",
          className,
        )}
      >
        {showImage ? (
          <img
            src={avatarUrl ?? undefined}
            alt={alt}
            className="size-full object-cover"
            onError={() => {
              if (avatarUrl) setFailedAvatarUrl(avatarUrl);
            }}
          />
        ) : (
          !isLoading && <span aria-hidden="true">{initial}</span>
        )}
      </span>
      {showPresence && user && (
        <PresenceIndicator
          status={presence}
          size={size}
          className="pointer-events-none absolute right-0 bottom-0"
        />
      )}
    </span>
  );
}
