import Dexie from "dexie";
import type { Table } from "dexie";

export type LocalAttachment = {
  id: number;
  messageId: number;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  metadata: Record<string, unknown> | null;
  url?: string;
};

export type LocalMessage = {
  id: number;
  conversationId: number;
  body: string;
  senderId: number;
  createdAt: Date;
  username: string | null;
  deletedAt?: Date | null;
  attachments?: Array<LocalAttachment>;
};

export type LocalConversation = {
  id: number;
  type: "direct";
  otherUser: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  lastMessage: {
    id: number;
    body: string;
    createdAt: Date;
    senderId: number;
  } | null;
  unreadCount?: number;
};

export type LocalUser = {
  id: number;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

class LocalDatabase extends Dexie {
  messages!: Table<LocalMessage, number>;
  conversations!: Table<LocalConversation, number>;
  users!: Table<LocalUser, number>;

  constructor() {
    super("chat-local-cache");
    this.version(1).stores({
      messages: "id, conversationId, createdAt",
      conversations: "id",
      users: "id",
    });
  }
}

export const localDb = new LocalDatabase();

export async function hydrateLocalDb() {
  await localDb.open();
}

export async function pruneLocalMessages() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const expired = await localDb.messages
    .where("createdAt")
    .below(cutoff)
    .toArray();
  if (!expired.length) return;
  await localDb.messages.bulkDelete(expired.map((message) => message.id));
}

export async function upsertMessages(rows: Array<LocalMessage>) {
  await localDb.messages.bulkPut(rows);
}

export async function deleteLocalMessage(id: number) {
  await localDb.messages.delete(id);
}

export async function markLocalMessageDeleted(id: number) {
  await localDb.messages.update(id, {
    deletedAt: new Date(),
    body: "",
  });
}

export async function upsertConversations(rows: Array<LocalConversation>) {
  await localDb.conversations.bulkPut(rows);
}

export async function updateConversationFromMessage(
  conversationId: number,
  message: LocalConversation["lastMessage"],
  hasUnread: boolean,
) {
  const conversation = await localDb.conversations.get(conversationId);
  if (!conversation) return;
  await localDb.conversations.put({
    ...conversation,
    lastMessage: message,
    unreadCount: hasUnread
      ? (conversation.unreadCount ?? 0) + 1
      : (conversation.unreadCount ?? 0),
  });
}

export async function markConversationRead(conversationId: number) {
  await localDb.conversations.update(conversationId, { unreadCount: 0 });
}

export async function upsertUsers(rows: Array<LocalUser>) {
  await localDb.users.bulkPut(rows);
}

export async function clearLocalDb() {
  await localDb.transaction(
    "rw",
    [localDb.messages, localDb.conversations, localDb.users],
    async () => {
      await Promise.all([
        localDb.messages.clear(),
        localDb.conversations.clear(),
        localDb.users.clear(),
      ]);
    },
  );
}
