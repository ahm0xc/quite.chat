CREATE TYPE "presence_status" AS ENUM('online', 'away', 'dnd', 'offline');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "presence_status" "presence_status" DEFAULT 'offline'::"presence_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp DEFAULT now() NOT NULL;