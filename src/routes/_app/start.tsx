import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { QrCodeIcon } from "@phosphor-icons/react/dist/csr/QrCode";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupInput } from "~/components/ui/input-group";
import { Spinner } from "~/components/ui/spinner";
import { useTRPC } from "~/integrations/trpc/react";

export const Route = createFileRoute("/_app/start")({
  component: RouteComponent,
});

function RouteComponent() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const handleMessage = async () => {
    setError(null);
    setLoading(true);
    try {
      const user = await queryClient.fetchQuery(
        trpc.users.getByUsername.queryOptions({ username }),
      );
      getOrCreate.mutate({ targetUserId: user.id });
    } catch {
      setError("User not found");
    } finally {
      setLoading(false);
    }
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
          Start conversation
        </h1>
        <div className="size-9" />
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" aria-label="Copy link">
          <LinkIcon />
        </Button>
        <Button variant="outline" size="icon" aria-label="QR code">
          <QrCodeIcon />
        </Button>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <InputGroup className="flex-1">
            <InputGroupInput
              placeholder="Enter a username..."
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
            />
          </InputGroup>
          <Button
            variant="outline"
            aria-label="Message"
            disabled={!username || loading || getOrCreate.isPending}
            onClick={handleMessage}
          >
            {loading ? <Spinner /> : "Message"}
          </Button>
        </div>
        {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
      </div>
    </div>
  );
}
