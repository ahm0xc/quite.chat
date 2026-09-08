import { upsertConversations, upsertMessages, upsertUsers } from "./local-db";
import type { LocalConversation, LocalMessage } from "./local-db";

export async function syncConversations(rows: Array<LocalConversation>) {
  await upsertConversations(rows);
  const usersToCache = rows.flatMap((row) => {
    const otherUser = row.otherUser;
    if (otherUser?.id == null) return [];
    return [
      {
        id: otherUser.id,
        username: otherUser.username,
        displayName: otherUser.displayName,
        avatarUrl: otherUser.avatarUrl,
      },
    ];
  });
  if (usersToCache.length) await upsertUsers(usersToCache);
}

export const syncMessages = (rows: Array<LocalMessage>) => upsertMessages(rows);
export const syncUser = (row: { id: number }) => upsertUsers([row]);
