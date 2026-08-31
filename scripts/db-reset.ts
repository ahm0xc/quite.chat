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
  console.log("Database reset: dropped all objects in public schema.");
} finally {
  await client.end();
}
