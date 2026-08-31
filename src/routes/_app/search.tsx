import { useState, useCallback } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/integrations/trpc/react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/_app/search")({ component: SearchPage });

function SearchPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const search = useQuery({
    ...trpc.users.search.queryOptions({ query: searchQuery }),
    enabled: searchQuery.length > 0,
  });

  const getOrCreate = useMutation(
    trpc.conversations.getOrCreate.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries(trpc.conversations.list.queryOptions());
        navigate({
          to: "/c/$conversationId",
          params: { conversationId: String(data.conversationId) },
        });
      },
    }),
  );

  const handleMessage = useCallback(
    (userId: number) => {
      getOrCreate.mutate({ targetUserId: userId });
    },
    [getOrCreate],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      setSearchQuery(query.trim());
    }
  };

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <h1 className="font-heading text-lg font-semibold">Search Users</h1>
      </div>

      <Input
        placeholder="Search by username... (press Enter)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />

      <div className="mt-4 flex flex-col gap-1">
        {search.data?.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {user.username?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {user.displayName ?? user.username}
                </p>
                {user.displayName && (
                  <p className="text-xs text-muted-foreground">
                    @{user.username}
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleMessage(user.id)}
              disabled={getOrCreate.isPending}
            >
              Message
            </Button>
          </div>
        ))}
        {searchQuery && search.data?.length === 0 && !search.isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No users found.
          </p>
        )}
      </div>
    </div>
  );
}
