import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const conversationType = pgEnum("conversation_type", [
  "direct",
  "group",
]);
export const conversationMemberRole = pgEnum("conversation_member_role", [
  "owner",
  "admin",
  "member",
]);

export const users = pgTable(
  "users",
  {
    id: serial().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    username: text(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [unique("users_clerk_user_id_unique").on(table.clerkUserId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: serial().primaryKey(),
    type: conversationType().notNull(),
    title: text(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("conversations_created_by_idx").on(table.createdBy)],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: conversationMemberRole().notNull().default("member"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    lastReadMessageId: integer("last_read_message_id"),
    leftAt: timestamp("left_at"),
  },
  (table) => [
    unique("conversation_members_conversation_user_unique").on(
      table.conversationId,
      table.userId,
    ),
    index("conversation_members_user_idx").on(table.userId),
    index("conversation_members_conversation_idx").on(table.conversationId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: serial().primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: integer("sender_id")
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    replyToMessageId: integer("reply_to_message_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    index("messages_reply_to_idx").on(table.replyToMessageId),
  ],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("message_reactions_message_user_emoji_unique").on(
      table.messageId,
      table.userId,
      table.emoji,
    ),
    index("message_reactions_message_idx").on(table.messageId),
  ],
);
