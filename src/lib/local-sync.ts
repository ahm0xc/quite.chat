import { upsertConversations, upsertMessages, upsertUsers } from "./local-db";
import type { LocalConversation, LocalMessage } from "./local-db";

export const syncConversations = (rows: Array<LocalConversation>) =>
  upsertConversations(rows);
export const syncMessages = (rows: Array<LocalMessage>) => upsertMessages(rows);
export const syncUser = (row: { id: number }) => upsertUsers([row]);
