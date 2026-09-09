import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { GroupAvatar } from "~/components/group-avatar";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { UserAvatar } from "~/components/user-avatar";
import { useTRPC } from "~/integrations/trpc/react";

export function GroupInfoDialog({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const details = useQuery({
    ...trpc.conversations.details.queryOptions({ conversationId }),
    enabled: open,
  });
  const me = useQuery(trpc.users.me.queryOptions());
  const [titleDraft, setTitleDraft] = React.useState<string | null>(null);
  const [addUsername, setAddUsername] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const isGroup = details.data?.type === "group";
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
  const addMembers = useMutation(
    trpc.conversations.addMembers.mutationOptions({
      onSuccess: () => {
        setAddUsername("");
        void queryClient.invalidateQueries(
          trpc.conversations.details.queryOptions({ conversationId }),
        );
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
        void queryClient.invalidateQueries(
          trpc.conversations.messages.queryOptions({ conversationId }),
        );
      },
      onError: (e) => setError(e.message),
    }),
  );
  const removeMember = useMutation(
    trpc.conversations.removeMember.mutationOptions({
      onError: (e) => setError(e.message),
      onSuccess: (_data, vars) => {
        if (vars.userId === me.data?.id) {
          onOpenChange(false);
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
        onOpenChange(false);
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

  const handleAdd = async () => {
    setError(null);
    const normalized = addUsername.trim().replace(/^@+/, "");
    if (!normalized) return;
    let user;
    try {
      user = await queryClient.fetchQuery(
        trpc.users.getByUsername.queryOptions({ username: normalized }),
      );
    } catch {
      setError("User not found");
      return;
    }
    try {
      await addMembers.mutateAsync({ conversationId, userIds: [user.id] });
    } catch {}
  };

  if (!isGroup) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Group info</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <GroupAvatar
              title={details.data?.title}
              members={members}
              size="lg"
            />
            <div className="flex-1">
              <p className="font-medium">{details.data?.title}</p>
              <p className="text-muted-foreground text-xs">
                {members.length} members
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              <Input
                value={title}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="Group title"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => updateTitle.mutate({ conversationId, title })}
                disabled={updateTitle.isPending}
              >
                Save
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {members.map((m) => (
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
                  <p className="text-muted-foreground text-xs capitalize">
                    {m.role}
                  </p>
                </div>
                {m.userId !== me.data?.id && isAdmin && m.role !== "owner" && (
                  <div className="flex gap-1">
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateRole.mutate({
                            conversationId,
                            userId: m.userId,
                            role: m.role === "admin" ? "member" : "admin",
                          })
                        }
                      >
                        {m.role === "admin" ? "Demote" : "Make admin"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        removeMember.mutate({
                          conversationId,
                          userId: m.userId,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isAdmin && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="text-sm font-medium">Add members</p>
              <div className="flex gap-2">
                <Input
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder="Username"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleAdd}
                  disabled={addMembers.isPending}
                >
                  Add
                </Button>
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
          )}

          {error && !isAdmin && (
            <p className="text-destructive text-sm">{error}</p>
          )}

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
