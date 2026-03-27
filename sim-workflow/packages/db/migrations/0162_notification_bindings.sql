CREATE TABLE IF NOT EXISTS "notification_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "channel" text NOT NULL DEFAULT 'telegram',
  "channel_user_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE("user_id", "workspace_id", "channel")
);
--> statement-breakpoint
CREATE INDEX "notification_bindings_user_workspace_idx" ON "notification_bindings" USING btree ("user_id", "workspace_id");
