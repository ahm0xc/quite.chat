import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { UserAvatar } from "~/components/user-avatar";
import { useDebounce } from "~/hooks/use-debounce";
import { useTRPC } from "~/integrations/trpc/react";

export const Route = createFileRoute("/_app/groups/new")({
  component: RouteComponent,
});

function RouteComponent() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debounced = useDebounce(search, 300);
  const [selected, setSelected] = React.useState<
    Array<{
      id: number;
      username: string | null;
      displayName: string | null;
      avatarUrl: string | null;
    }>
  >([]);
  const [error, setError] = React.useState<string | null>(null);

  const searchQuery = useQuery({
    ...trpc.users.search.queryOptions({ q: debounced.trim() }),
    enabled: debounced.trim().length > 0,
  });
  const results = (searchQuery.data ?? []).filter(
    (u) => !selected.some((s) => s.id === u.id),
  );

  const createGroup = useMutation(
    trpc.conversations.createGroup.mutationOptions({
      onSuccess: (data) => {
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
        void navigate({
          to: "/c/$conversationId",
          params: { conversationId: String(data.conversationId) },
        });
      },
      onError: (e) => setError(e.message),
    }),
  );

  const toggleSelect = (user: {
    id: number;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  }) => {
    setSelected((prev) =>
      prev.some((p) => p.id === user.id)
        ? prev.filter((p) => p.id !== user.id)
        : [...prev, user],
    );
  };

  const handleCreate = () => {
    if (selected.length < 2) {
      setError("Select at least 2 members");
      return;
    }
    setError(null);
    createGroup.mutate({
      title: title.trim() || undefined,
      memberIds: selected.map((s) => s.id),
    });
  };

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <div className="flex items-center">
        <Link to="/">
          <Button variant="ghost" size="icon" aria-label="Back">
            <CaretLeftIcon />
          </Button>
        </Link>
        <h1 className="font-heading flex-1 text-center text-2xl font-bold">
          New group
        </h1>
        <div className="size-9" />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Input
          placeholder="Group title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={50}
        />

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((u) => (
              <span
                key={u.id}
                className="bg-accent inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm"
              >
                <UserAvatar userId={u.id} username={u.username} size="sm" />
                {u.displayName ?? u.username}
                <button
                  type="button"
                  onClick={() => toggleSelect(u)}
                  className="ml-1"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <Input
          placeholder="Search users to add"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex flex-col">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggleSelect(u)}
              className="hover:bg-accent flex items-center gap-3 rounded-xl px-3 py-2 text-left"
            >
              <UserAvatar userId={u.id} username={u.username} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {u.displayName ?? u.username}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  @{u.username}
                </p>
              </div>
              {selected.some((s) => s.id === u.id) && (
                <span className="text-xs">Selected</span>
              )}
            </button>
          ))}
          {debounced.trim() && results.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No users found
            </p>
          )}
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button
          onClick={handleCreate}
          disabled={createGroup.isPending || selected.length < 2}
        >
          Create group ({selected.length}/19)
        </Button>
        <p className="text-muted-foreground text-xs">
          You + {selected.length} members (max 20)
        </p>
      </div>
    </div>
  );
}
