import { DotsThreeVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsThreeVertical";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { GroupAvatar } from "~/components/group-avatar";
import { useSecondaryPanel } from "~/components/secondary-panel/secondary-panel-context";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { UserAvatar } from "~/components/user-avatar";
import { useIsMobile } from "~/hooks/use-mobile";
import { useTRPC } from "~/integrations/trpc/react";

export function ConvoInfoView({ conversationId }: { conversationId: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { close } = useSecondaryPanel();
  const isMobile = useIsMobile();
  const details = useQuery(
    trpc.conversations.details.queryOptions({ conversationId }),
  );
  const me = useQuery(trpc.users.me.queryOptions());
  const [titleDraft, setTitleDraft] = React.useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isGroup = details.data?.type === "group";
  const otherUser = details.data?.otherUser;
  const members =
    (
      details.data as
        | {
            members?: Array<{
              userId: number;
              role: string;
              username: string | null;
              displayName: string | null;
              avatarUrl: string | null;
            }>;
          }
        | undefined
    )?.members ?? [];
  const myRole = members.find((m) => m.userId === me.data?.id)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";
  const title = titleDraft ?? details.data?.rawTitle ?? "";

  const updateTitle = useMutation(
    trpc.conversations.updateGroup.mutationOptions({
      onSuccess: () => {
        setTitleDraft(null);
        void queryClient.invalidateQueries(
          trpc.conversations.details.queryOptions({ conversationId }),
        );
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
      },
    }),
  );
  const removeMember = useMutation(
    trpc.conversations.removeMember.mutationOptions({
      onError: (e) => setError(e.message),
      onSuccess: (_data, vars) => {
        if (vars.userId === me.data?.id) {
          void import("~/lib/local-db").then(({ localDb }) => {
            void localDb.conversations.delete(conversationId);
            void localDb.messages
              .where("conversationId")
              .equals(conversationId)
              .delete();
          });
          void queryClient.invalidateQueries(
            trpc.conversations.list.queryOptions(),
          );
          void navigate({ to: "/" });
          return;
        }
        void queryClient.invalidateQueries(
          trpc.conversations.details.queryOptions({ conversationId }),
        );
        void queryClient.invalidateQueries(
          trpc.conversations.messages.queryOptions({ conversationId }),
        );
      },
    }),
  );
  const updateRole = useMutation(
    trpc.conversations.updateMemberRole.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(
          trpc.conversations.details.queryOptions({ conversationId }),
        );
      },
    }),
  );
  const deleteGroup = useMutation(
    trpc.conversations.deleteGroup.mutationOptions({
      onSuccess: () => {
        void import("~/lib/local-db").then(({ localDb }) => {
          void localDb.conversations.delete(conversationId);
          void localDb.messages
            .where("conversationId")
            .equals(conversationId)
            .delete();
        });
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
        void navigate({ to: "/" });
      },
    }),
  );

  const closePanel = () =>
    isMobile ? navigate({ to: `/c/${conversationId}` }) : close();

  const displayName = isGroup
    ? details.data?.title
    : (otherUser?.displayName ?? otherUser?.username ?? "Unknown");

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isGroup ? (
            <GroupAvatar
              title={details.data?.title}
              members={members}
              size="lg"
            />
          ) : (
            <UserAvatar
              userId={otherUser?.id}
              username={otherUser?.username}
              size="lg"
            />
          )}
          <div className="flex-1">
            {isGroup && isEditingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  if (title !== details.data?.rawTitle) {
                    updateTitle.mutate({ conversationId, title });
                  }
                  setIsEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                autoFocus
                className="h-auto p-0 text-base font-medium"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="font-medium">{displayName}</p>
                {isGroup && isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setTitleDraft(details.data?.rawTitle ?? "");
                      setIsEditingTitle(true);
                    }}
                  >
                    <PencilSimpleIcon className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              {isGroup
                ? `${members.length} members`
                : otherUser?.username
                  ? `@${otherUser.username}`
                  : ""}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={closePanel}>
          <XIcon />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {members.map((m) => {
          const showDropdown =
            isGroup &&
            m.userId !== me.data?.id &&
            isAdmin &&
            m.role !== "owner";

          return (
            <div
              key={m.userId}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5"
            >
              <UserAvatar userId={m.userId} username={m.username} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.displayName ?? m.username ?? "Unknown"}
                  {m.userId === me.data?.id && " (you)"}
                </p>
                {isGroup && (
                  <p className="text-muted-foreground text-xs capitalize">
                    {m.role}
                  </p>
                )}
              </div>
              {showDropdown && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" />}
                  >
                    <DotsThreeVerticalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isOwner && (
                      <DropdownMenuItem
                        onClick={() =>
                          updateRole.mutate({
                            conversationId,
                            userId: m.userId,
                            role: m.role === "admin" ? "member" : "admin",
                          })
                        }
                      >
                        {m.role === "admin" ? "Demote" : "Make admin"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        removeMember.mutate({
                          conversationId,
                          userId: m.userId,
                        })
                      }
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {isGroup && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <Button
            variant="outline"
            onClick={() => {
              if (!me.data?.id) return;
              removeMember.mutate({ conversationId, userId: me.data.id });
            }}
            disabled={removeMember.isPending || !me.data?.id}
          >
            Leave group
          </Button>
          {isOwner && (
            <Button
              variant="destructive"
              onClick={() => deleteGroup.mutate({ conversationId })}
              disabled={deleteGroup.isPending}
            >
              Delete group
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
