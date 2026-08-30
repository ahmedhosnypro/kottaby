DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_locale') THEN
        CREATE TYPE "app_locale" AS ENUM('ar', 'en');
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" "app_locale";