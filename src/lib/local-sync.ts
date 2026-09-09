import { upsertConversations, upsertMessages, upsertUsers } from "./local-db";
import type { LocalConversation, LocalMessage } from "./local-db";

export async function syncConversations(rows: Array<LocalConversation>) {
  const { localDb } = await import("./local-db");
  const existing = await localDb.conversations.toArray();
  const incomingIds = new Set(rows.map((r) => r.id));
  const staleIds = existing
    .map((c) => c.id)
    .filter((id) => !incomingIds.has(id));
  if (staleIds.length) {
    await localDb.conversations.bulkDelete(staleIds);
    await localDb.messages.where("conversationId").anyOf(staleIds).delete();
  }
  await upsertConversations(rows);
  const usersToCache = rows.flatMap((row) => {
    const other = row.otherUser;
    const memberUsers =
      row.members?.map((m) => ({
        id: m.userId,
        username: m.username,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
      })) ?? [];
    const otherUser =
      other?.id == null
        ? []
        : [
            {
              id: other.id,
              username: other.username,
              displayName: other.displayName,
              avatarUrl: other.avatarUrl,
            },
          ];
    return [...memberUsers, ...otherUser];
  });
  if (usersToCache.length) await upsertUsers(usersToCache);
}

export const syncMessages = (rows: Array<LocalMessage>) => upsertMessages(rows);
export const syncUser = (row: { id: number }) => upsertUsers([row]);
