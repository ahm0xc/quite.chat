import { Link } from "@tanstack/react-router";
import * as React from "react";

import type { SystemMessageData } from "~/lib/system-messages";

function UserLink({
  username,
  name,
}: {
  username: string | null;
  name: string;
}) {
  if (!username) return <span className="font-medium">{name}</span>;
  return (
    <Link
      to="/p/$username"
      params={{ username }}
      className="font-medium underline-offset-2 hover:underline"
    >
      {name}
    </Link>
  );
}

export function SystemPill({ data }: { data: SystemMessageData }) {
  let content: React.ReactNode;
  switch (data.type) {
    case "group_created":
      content = (
        <>
          <UserLink username={data.actorUsername} name={data.actorName} />{" "}
          created the group
        </>
      );
      break;
    case "member_added":
      content = (
        <>
          <UserLink username={data.actorUsername} name={data.actorName} /> added{" "}
          <UserLink username={data.targetUsername} name={data.targetName} />
        </>
      );
      break;
    case "member_kicked":
      content = (
        <>
          <UserLink username={data.actorUsername} name={data.actorName} />{" "}
          removed{" "}
          <UserLink username={data.targetUsername} name={data.targetName} />
        </>
      );
      break;
    case "member_left":
      content = (
        <>
          <UserLink username={data.actorUsername} name={data.actorName} /> left
        </>
      );
      break;
    case "title_changed":
      content = (
        <>
          <UserLink username={data.actorUsername} name={data.actorName} />{" "}
          changed the title to &quot;{data.newTitle}&quot;
        </>
      );
      break;
    case "role_changed":
      content =
        data.newRole === "admin" ? (
          <>
            <UserLink username={data.actorUsername} name={data.actorName} />{" "}
            made{" "}
            <UserLink username={data.targetUsername} name={data.targetName} />{" "}
            an admin
          </>
        ) : (
          <>
            <UserLink username={data.actorUsername} name={data.actorName} />{" "}
            removed{" "}
            <UserLink username={data.targetUsername} name={data.targetName} />{" "}
            as admin
          </>
        );
      break;
    case "ownership_transferred":
      content = (
        <>
          Ownership transferred to{" "}
          <UserLink username={data.newOwnerUsername} name={data.newOwnerName} />
        </>
      );
      break;
    default: {
      const _exhaustive: never = data;
      void _exhaustive;
      content = null;
    }
  }

  return (
    <div className="bg-muted text-muted-foreground mx-auto my-2 max-w-[80%] rounded-full px-4 py-1.5 text-center text-xs">
      {content}
    </div>
  );
}
