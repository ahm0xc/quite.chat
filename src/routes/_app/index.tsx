import { createFileRoute } from "@tanstack/react-router";
import { ConvoList } from "~/components/convo-list";
import { useIsMobile } from "~/hooks/use-mobile";

export const Route = createFileRoute("/_app/")({
  component: RouteComponent,
});

function RouteComponent() {
  const isMobile = useIsMobile();

  if (!isMobile)
    return (
      <div className="h-dvh flex justify-center items-center">
        <p className="text-muted-foreground">Start a conversation</p>
      </div>
    );

  return (
    <div>
      <ConvoList />
    </div>
  );
}
