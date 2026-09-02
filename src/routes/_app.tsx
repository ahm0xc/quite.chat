import { auth } from "@clerk/tanstack-react-start/server";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { ConvoList } from "~/components/convo-list";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { useIsMobile } from "~/hooks/use-mobile";

const requireAuth = createServerFn().handler(async () => {
  const session = await auth({ acceptsToken: "session_token" });
  if (!session.userId) {
    throw redirect({ to: "/sign-in/$" });
  }
});

export const Route = createFileRoute("/_app")({
  // The chat shell is cache-first. Server APIs remain protected by Clerk,
  // but the initial HTML should not wait for Clerk/tRPC before booting Dexie.
  ssr: false,
  beforeLoad: async () => await requireAuth(),
  component: Layout,
});

function Layout() {
  const isMobile = useIsMobile();

  if (isMobile) return <Outlet />;

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="25rem" minSize="18rem" maxSize="25rem">
        <ConvoList />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel>
        <Outlet />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
