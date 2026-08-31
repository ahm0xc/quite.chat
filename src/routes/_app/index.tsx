import { Link, createFileRoute } from "@tanstack/react-router";
import { Show, UserButton } from "@clerk/tanstack-react-start";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/_app/")({ component: HomePage });

function HomePage() {
  return (
    <div className="p-8">
      <h1 className="font-heading">Welcome to TanStack Start</h1>
      <p>
        Edit <code>src/routes/index.tsx</code> to get started.
      </p>

      <Show when="signed-in">
        <UserButton />
      </Show>
      <Show when="signed-out">
        <Button asChild>
          <Link to="/sign-up/$">Sign Up</Link>
        </Button>
      </Show>
    </div>
  );
}
