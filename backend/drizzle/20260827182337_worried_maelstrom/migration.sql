ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp;