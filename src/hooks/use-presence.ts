import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { useTRPC } from "~/integrations/trpc/react";
import { pusherClient } from "~/lib/pusher-client";

export type PresenceStatus = "online" | "away" | "dnd" | "offline";

export const PRESENCE_META: Record<PresenceStatus, { label: string }> = {
  online: { label: "Online" },
  away: { label: "Away" },
  dnd: { label: "Do not disturb" },
  offline: { label: "Offline" },
};

const statuses = new Map<number, PresenceStatus>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function setCachedStatus(userId: number, status: PresenceStatus) {
  if (statuses.get(userId) !== status) {
    statuses.set(userId, status);
    notify();
  }
}

function toUserId(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) ? parsed : null;
}

export function usePresenceOf(
  userId: number | undefined,
  fallback: PresenceStatus = "offline",
): PresenceStatus {
  const subscribe = React.useCallback((onChange: () => void) => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  const getSnapshot = React.useCallback((): PresenceStatus => {
    if (userId === undefined) return fallback;
    return statuses.get(userId) ?? fallback;
  }, [fallback, userId]);
  const getServerSnapshot = React.useCallback(
    (): PresenceStatus => fallback,
    [fallback],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function PresenceBoot() {
  const { isLoaded, isSignedIn } = useAuth();

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useQuery({
    ...trpc.users.me.queryOptions(),
    enabled: isLoaded && isSignedIn === true,
  });

  const claimedOnlineRef = React.useRef(false);

  const setOnline = useMutation(
    trpc.users.setStatus.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.users.me.queryOptions());
      },
    }),
  );

  React.useEffect(() => {
    if (!isLoaded || isSignedIn !== true) return;
    const channel = pusherClient.subscribe("presence-global");

    const onPresenceUpdated = (data: {
      userId: number;
      status: PresenceStatus;
    }) => {
      const userId = toUserId(data.userId);
      if (userId !== null) setCachedStatus(userId, data.status);
    };
    const onSubscriptionSucceeded = (members: {
      each: (
        fn: (member: {
          id: string;
          info?: { status?: PresenceStatus };
        }) => void,
      ) => void;
    }) => {
      members.each((member) => {
        const userId = toUserId(member.id);
        if (userId !== null)
          setCachedStatus(userId, member.info?.status ?? "online");
      });
    };
    const onMemberAdded = (member: {
      id: string;
      info?: { status?: PresenceStatus };
    }) => {
      const userId = toUserId(member.id);
      if (userId !== null)
        setCachedStatus(userId, member.info?.status ?? "online");
    };
    const onMemberRemoved = (member: { id: string }) => {
      // Server webhook broadcasts presence.updated shortly after; mark
      // offline optimistically so the UI never shows a stale green dot.
      const userId = toUserId(member.id);
      if (userId !== null) setCachedStatus(userId, "offline");
    };

    channel.bind("presence.updated", onPresenceUpdated);
    channel.bind("pusher:subscription_succeeded", onSubscriptionSucceeded);
    channel.bind("pusher:member_added", onMemberAdded);
    channel.bind("pusher:member_removed", onMemberRemoved);

    return () => {
      channel.unbind("presence.updated", onPresenceUpdated);
      channel.unbind("pusher:subscription_succeeded", onSubscriptionSucceeded);
      channel.unbind("pusher:member_added", onMemberAdded);
      channel.unbind("pusher:member_removed", onMemberRemoved);
      pusherClient.unsubscribe("presence-global");
    };
  }, [isLoaded, isSignedIn]);

  React.useEffect(() => {
    if (me.data && me.data.presenceStatus !== "offline") {
      claimedOnlineRef.current = false;
      return;
    }
    if (
      me.data?.presenceStatus === "offline" &&
      !claimedOnlineRef.current &&
      !setOnline.isPending
    ) {
      claimedOnlineRef.current = true;
      setOnline.mutate(
        { status: "online" },
        {
          onError: () => {
            claimedOnlineRef.current = false;
          },
        },
      );
    }
  }, [me.data, setOnline]);

  return null;
}
