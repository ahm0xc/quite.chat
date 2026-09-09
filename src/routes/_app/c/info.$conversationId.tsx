import { createFileRoute } from "@tanstack/react-router";

import { ConvoInfoView } from "~/components/convo-info-view";

export const Route = createFileRoute("/_app/c/info/$conversationId")({
  component: ConvoInfoPage,
});

function ConvoInfoPage() {
  const { conversationId } = Route.useParams();

  return (
    <div className="h-dvh overflow-y-auto">
      <ConvoInfoView conversationId={Number(conversationId)} />
    </div>
  );
}
