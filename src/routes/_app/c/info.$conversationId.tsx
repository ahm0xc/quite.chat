import { createFileRoute } from "@tanstack/react-router";

import { GroupInfoView } from "~/components/group-info-view";

export const Route = createFileRoute("/_app/c/info/$conversationId")({
  component: GroupInfoPage,
});

function GroupInfoPage() {
  const { conversationId } = Route.useParams();

  return (
    <div className="h-dvh overflow-y-auto">
      <GroupInfoView conversationId={Number(conversationId)} />
    </div>
  );
}
