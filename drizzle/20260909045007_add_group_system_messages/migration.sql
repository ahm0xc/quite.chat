CREATE TYPE "message_kind" AS ENUM('user', 'system');--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" "message_kind" DEFAULT 'user'::"message_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;