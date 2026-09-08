import { useAuth, useClerk } from "@clerk/tanstack-react-start";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { MonitorIcon } from "@phosphor-icons/react/dist/csr/Monitor";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import * as React from "react";

import { useTheme } from "~/components/theme-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { PresenceIndicator, UserAvatar } from "~/components/user-avatar";
import { useConversationsRealtime } from "~/hooks/use-conversation-realtime";
import { PRESENCE_META } from "~/hooks/use-presence";
import { useTRPC } from "~/integrations/trpc/react";
import { clearLocalDb, localDb, markConversationRead } from "~/lib/local-db";
import { syncConversations } from "~/lib/local-sync";

const STATUS_OPTIONS = ["online", "away", "dnd"] as const;

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
  const [logoutDialogOpen, setLogoutDialogOpen] = React.useState(false);

  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { setTheme, theme } = useTheme();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const currentConversationId = pathname.startsWith("/c/")
    ? Number(pathname.slice(3))
    : null;
  const me = useQuery({
    ...trpc.users.me.queryOptions(),
    enabled: isLoaded && isSignedIn === true,
  });
  const setStatus = useMutation(
    trpc.users.setStatus.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.users.me.queryOptions());
      },
    }),
  );
  const goOffline = useMutation(trpc.users.goOffline.mutationOptions());
  const conversations = useQuery({
    ...trpc.conversations.list.queryOptions(),
    enabled: isLoaded && isSignedIn === true,
  });
  const localConversations = useLiveQuery(
    () => localDb.conversations.toArray(),
    [],
  );
  const conversationIds = React.useMemo(
    () =>
      (localConversations ?? conversations.data ?? [])
        .map((convo) => convo.id)
        .filter((id) => id !== currentConversationId),
    [localConversations, conversations.data, currentConversationId],
  );
  useConversationsRealtime(
    conversationIds,
    currentConversationId,
    me.data?.id,
    me.data?.presenceStatus === "dnd",
  );
  React.useEffect(() => {
    if (currentConversationId !== null)
      void markConversationRead(currentConversationId);
  }, [currentConversationId]);
  React.useEffect(() => {
    if (conversations.data) void syncConversations(conversations.data);
  }, [conversations.data]);

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Chat</h1>
        <div className="flex items-center gap-2">
          <Link to="/start">
            <Button
              variant="outline"
              size="icon"
              aria-label="Start conversation"
            >
              <PlusIcon />
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger render={<button />}>
              <UserAvatar
                userId={me.data?.id}
                showPresence
                size="sm"
                className="border-2"
              />
            </DropdownMenuTrigger>

            <DropdownMenuContent>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <PresenceIndicator
                    status={me.data?.presenceStatus ?? "offline"}
                    className="size-4"
                  />
                  {PRESENCE_META[me.data?.presenceStatus ?? "offline"].label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {STATUS_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option}
                      disabled={
                        me.data?.presenceStatus === option ||
                        setStatus.isPending
                      }
                      onClick={() => setStatus.mutate({ status: option })}
                    >
                      <PresenceIndicator status={option} className="size-4" />
                      {PRESENCE_META[option].label}
                      {me.data?.presenceStatus === option && (
                        <CheckIcon className="ml-auto" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {theme === "light" && <SunIcon />}
                  {theme === "dark" && <MoonIcon />}
                  {theme === "system" && <MonitorIcon />}
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme("light")}>
                    <SunIcon />
                    Light
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("dark")}>
                    <MoonIcon />
                    Dark
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("system")}>
                    <MonitorIcon />
                    System
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setLogoutDialogOpen(true)}
              >
                <SignOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await goOffline.mutateAsync().catch(() => undefined);
                await clearLocalDb();
                await signOut();
              }}
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-6 flex flex-col">
        {[
          ...(localConversations?.length
            ? localConversations
            : (conversations.data ?? [])),
        ]
          .sort(
            (a, b) =>
              (b.lastMessage?.createdAt
                ? new Date(b.lastMessage.createdAt).getTime()
                : 0) -
              (a.lastMessage?.createdAt
                ? new Date(a.lastMessage.createdAt).getTime()
                : 0),
          )
          .map((convo) => (
            <React.Fragment key={convo.id}>
              <Link
                to="/c/$conversationId"
                params={{ conversationId: String(convo.id) }}
                activeProps={{ className: "bg-accent font-medium" }}
                className="hover:bg-accent flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:[&+div]:opacity-0 [&.bg-accent+div]:opacity-0"
              >
                <UserAvatar
                  userId={convo.otherUser?.id}
                  username={convo.otherUser?.username}
                  showPresence
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-heading truncate text-sm font-medium">
                      {convo.otherUser?.displayName ??
                        convo.otherUser?.username ??
                        "Unknown"}
                    </span>
                    {convo.lastMessage && (
                      <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                        {formatTime(convo.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  {convo.lastMessage && (
                    <p className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {convo.lastMessage.body}
                      </span>
                      {"unreadCount" in convo &&
                        (convo.unreadCount ?? 0) > 0 && (
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white"
                            aria-label={`${convo.unreadCount} unread messages`}
                          >
                            {convo.unreadCount}
                          </span>
                        )}
                    </p>
                  )}
                </div>
              </Link>

              <div className="bg-border mx-4 h-px transition-opacity has-[+a.bg-accent]:opacity-0 has-[+a:hover]:opacity-0" />
            </React.Fragment>
          ))}
        {(localConversations?.length
          ? localConversations
          : (conversations.data ?? [])
        ).length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No conversations yet. Search for users to start chatting.
          </p>
        )}
      </div>
    </div>
  );
}
