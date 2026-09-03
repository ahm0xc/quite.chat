CREATE TABLE "message_attachments" (
	"id" serial PRIMARY KEY,
	"message_id" integer NOT NULL,
	"object_key" text NOT NULL CONSTRAINT "message_attachments_object_key_unique" UNIQUE,
	"original_name" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "body" SET DEFAULT '';--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" ("message_id");--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE;