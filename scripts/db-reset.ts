import { config } from "dotenv";
import pg from "pg";

config({ path: [".env.local", ".env"] });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  // Drop all tables, views, and functions in the public schema
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  // Drop drizzle migration states
  await client.query("DROP SCHEMA IF EXISTS __drizzle CASCADE;");
  console.log("Database reset: dropped all objects in public schema.");
  console.log("Database reset: dropped all objects in __drizzle schema.");
} finally {
  await client.end();
}
