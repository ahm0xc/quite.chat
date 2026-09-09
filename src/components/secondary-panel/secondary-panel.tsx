import * as React from "react";

import { ResizablePanel } from "../ui/resizable";
import { useSecondaryPanel } from "./secondary-panel-context";

type ViewComponent = React.ComponentType<{ conversationId: number }>;

export function SecondaryPanel({
  views,
}: {
  views: Record<string, ViewComponent>;
}) {
  const { currentView, viewProps } = useSecondaryPanel();

  if (!currentView) return null;

  const View = views[currentView];

  return (
    <ResizablePanel maxSize="25rem" minSize="20rem">
      <div className="h-full border-l">
        <View conversationId={viewProps.conversationId as number} />
      </div>
    </ResizablePanel>
  );
}
