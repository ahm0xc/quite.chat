import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "~/env";

import { relations } from "./relations.ts";

export const db = drizzle(env.DATABASE_URL, { relations });
