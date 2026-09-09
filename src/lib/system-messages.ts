import { z } from "zod";

export const systemMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("group_created"),
    actorId: z.number(),
    actorName: z.string(),
    actorUsername: z.string().nullable(),
  }),
  z.object({
    type: z.literal("member_added"),
    actorId: z.number(),
    actorName: z.string(),
    actorUsername: z.string().nullable(),
    targetId: z.number(),
    targetName: z.string(),
    targetUsername: z.string().nullable(),
  }),
  z.object({
    type: z.literal("member_kicked"),
    actorId: z.number(),
    actorName: z.string(),
    actorUsername: z.string().nullable(),
    targetId: z.number(),
    targetName: z.string(),
    targetUsername: z.string().nullable(),
  }),
  z.object({
    type: z.literal("member_left"),
    actorId: z.number(),
    actorName: z.string(),
    actorUsername: z.string().nullable(),
  }),
  z.object({
    type: z.literal("title_changed"),
    actorId: z.number(),
    actorName: z.string(),
    actorUsername: z.string().nullable(),
    newTitle: z.string().max(50),
  }),
  z.object({
    type: z.literal("role_changed"),
    actorId: z.number(),
    actorName: z.string(),
    actorUsername: z.string().nullable(),
    targetId: z.number(),
    targetName: z.string(),
    targetUsername: z.string().nullable(),
    newRole: z.enum(["admin", "member"]),
  }),
  z.object({
    type: z.literal("ownership_transferred"),
    prevOwnerId: z.number(),
    prevOwnerName: z.string(),
    newOwnerId: z.number(),
    newOwnerName: z.string(),
    newOwnerUsername: z.string().nullable(),
  }),
]);

export type SystemMessageData = z.infer<typeof systemMessageSchema>;

export function getSystemPreview(data: SystemMessageData): string {
  switch (data.type) {
    case "group_created":
      return `${data.actorName} created the group`;
    case "member_added":
      return `${data.actorName} added ${data.targetName}`;
    case "member_kicked":
      return `${data.actorName} removed ${data.targetName}`;
    case "member_left":
      return `${data.actorName} left`;
    case "title_changed":
      return `${data.actorName} changed the title to "${data.newTitle}"`;
    case "role_changed":
      return data.newRole === "admin"
        ? `${data.actorName} made ${data.targetName} an admin`
        : `${data.actorName} removed ${data.targetName} as admin`;
    case "ownership_transferred":
      return `Ownership transferred to ${data.newOwnerName}`;
    default: {
      const _exhaustive: never = data;
      void _exhaustive;
      return "";
    }
  }
}
