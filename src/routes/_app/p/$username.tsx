import { ChatCircleIcon } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "~/components/ui/button";
import { useTRPC } from "~/integrations/trpc/react";

export const Route = createFileRoute("/_app/p/$username")({
  component: RouteComponent,
});

function RouteComponent() {
  const { username } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();

  const user = useQuery(trpc.users.getByUsername.queryOptions({ username }));

  const getOrCreate = useMutation(
    trpc.conversations.getOrCreate.mutationOptions({
      onSuccess: (data) => {
        void navigate({
          to: "/c/$conversationId",
          params: { conversationId: String(data.conversationId) },
        });
      },
    }),
  );

  if (user.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="bg-muted size-24 animate-pulse rounded-full" />
      </div>
    );
  }

  if (!user.data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      {user.data.avatarUrl ? (
        <img
          src={user.data.avatarUrl}
          alt=""
          className="size-24 rounded-full object-cover"
        />
      ) : (
        <div className="bg-muted flex size-24 items-center justify-center rounded-full text-3xl font-medium">
          {user.data.username?.[0]?.toUpperCase() ?? "?"}
        </div>
      )}

      <div className="text-center">
        <h1 className="font-heading text-xl font-bold">
          {user.data.displayName ?? user.data.username ?? "Unknown"}
        </h1>
        {user.data.username && (
          <p className="text-muted-foreground text-sm">@{user.data.username}</p>
        )}
      </div>

      <Button
        onClick={() => getOrCreate.mutate({ targetUserId: user.data.id })}
        disabled={getOrCreate.isPending}
      >
        <ChatCircleIcon />
        Message
      </Button>
    </div>
  );
}
