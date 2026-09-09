import * as React from "react";

import { cn } from "~/lib/utils";

type GroupMemberFace = {
  userId?: number;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

function MemberFace({
  member,
  className,
}: {
  member: GroupMemberFace;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const name = member.displayName ?? member.username ?? "";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const showImage = Boolean(member.avatarUrl) && !failed;

  return (
    <span
      className={cn(
        "bg-muted flex items-center justify-center overflow-hidden rounded-full font-medium",
        className,
      )}
    >
      {showImage ? (
        <img
          src={member.avatarUrl ?? undefined}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}

export function GroupAvatar({
  title,
  members = [],
  size = "md",
  className,
}: {
  title?: string | null;
  members?: Array<GroupMemberFace>;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeCls =
    size === "sm"
      ? "size-8 text-xs"
      : size === "lg"
        ? "size-12 text-base"
        : "size-10 text-sm";
  const stackCls =
    size === "sm"
      ? "size-5 text-[9px]"
      : size === "lg"
        ? "size-7 text-xs"
        : "size-6 text-[10px]";
  const trimmed = title?.trim();
  const initial = (trimmed ? trimmed[0]?.toUpperCase() : undefined) ?? "G";
  const faces = members.slice(0, 2);

  if (faces.length >= 2) {
    return (
      <div className={cn("relative shrink-0", sizeCls, className)}>
        <MemberFace
          member={faces[0]}
          className={cn(
            "ring-background absolute top-0 left-0 ring-2",
            stackCls,
          )}
        />
        <MemberFace
          member={faces[1]}
          className={cn(
            "ring-background absolute right-0 bottom-0 ring-2",
            stackCls,
          )}
        />
      </div>
    );
  }

  if (faces.length === 1) {
    return (
      <MemberFace
        member={faces[0]}
        className={cn(sizeCls, "shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "bg-primary text-primary-foreground flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizeCls,
        className,
      )}
    >
      {initial}
    </div>
  );
}
