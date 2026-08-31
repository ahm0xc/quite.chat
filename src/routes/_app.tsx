import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { auth } from "@clerk/tanstack-react-start/server";

const requireAuth = createServerFn().handler(async () => {
  const session = await auth({ acceptsToken: "session_token" });
  if (!session.userId) {
    throw redirect({ to: "/sign-in" });
  }
});

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => await requireAuth(),
  component: Layout,
});

function Layout() {
  return <Outlet />;
}
