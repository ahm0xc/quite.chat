import { defineRelations } from "drizzle-orm";

import * as schema from "./schema.ts";

export const relations = defineRelations(schema, (r) => ({
  users: {
    createdConversations: r.many.conversations(),
    conversationMemberships: r.many.conversationMembers(),
    sentMessages: r.many.messages(),
    messageReactions: r.many.messageReactions(),
  },
  conversations: {
    creator: r.one.users({
      from: r.conversations.createdBy,
      to: r.users.id,
    }),
    members: r.many.conversationMembers(),
    messages: r.many.messages(),
  },
  conversationMembers: {
    conversation: r.one.conversations({
      from: r.conversationMembers.conversationId,
      to: r.conversations.id,
    }),
    user: r.one.users({
      from: r.conversationMembers.userId,
      to: r.users.id,
    }),
  },
  messages: {
    conversation: r.one.conversations({
      from: r.messages.conversationId,
      to: r.conversations.id,
    }),
    sender: r.one.users({
      from: r.messages.senderId,
      to: r.users.id,
    }),
    replyTo: r.one.messages({
      from: r.messages.replyToMessageId,
      to: r.messages.id,
      alias: "message_replies",
    }),
    replies: r.many.messages({ alias: "message_replies" }),
    reactions: r.many.messageReactions(),
    attachments: r.many.messageAttachments(),
  },
  messageReactions: {
    message: r.one.messages({
      from: r.messageReactions.messageId,
      to: r.messages.id,
    }),
    user: r.one.users({
      from: r.messageReactions.userId,
      to: r.users.id,
    }),
  },
  messageAttachments: {
    message: r.one.messages({
      from: r.messageAttachments.messageId,
      to: r.messages.id,
    }),
  },
}));
