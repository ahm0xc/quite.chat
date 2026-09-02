import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { MonitorIcon } from "@phosphor-icons/react/dist/csr/Monitor";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { useTRPC } from "~/integrations/trpc/react";

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
  const { user } = useUser();
  const { signOut } = useClerk();
  const trpc = useTRPC();
  const conversations = useQuery(trpc.conversations.list.queryOptions());
  const { setTheme, theme } = useTheme();
  const [logoutDialogOpen, setLogoutDialogOpen] = React.useState(false);

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
              {user ? (
                <img
                  src={user.imageUrl}
                  className="h-8 w-8 rounded-full border-2"
                />
              ) : (
                <div className="bg-muted size-10 animate-pulse rounded-full border-2" />
              )}
            </DropdownMenuTrigger>

            <DropdownMenuContent>
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
            <AlertDialogAction variant="destructive" onClick={() => signOut()}>
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-6 flex flex-col gap-1">
        {conversations.data?.map((convo) => (
          <Link
            key={convo.id}
            to="/c/$conversationId"
            params={{ conversationId: String(convo.id) }}
            className="hover:bg-accent flex items-center gap-3 rounded-md px-3 py-2 transition-colors"
          >
            {convo.otherUser?.avatarUrl ? (
              <img
                src={convo.otherUser.avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium">
                {convo.otherUser?.username?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
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
                <p className="text-muted-foreground truncate text-sm">
                  {convo.lastMessage.body}
                </p>
              )}
            </div>
          </Link>
        ))}
        {conversations.data?.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No conversations yet. Search for users to start chatting.
          </p>
        )}
      </div>
    </div>
  );
}
