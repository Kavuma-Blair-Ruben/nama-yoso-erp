ALTER TABLE "main_recipes" ADD COLUMN "branches" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD COLUMN "branches" text[] DEFAULT '{}'::text[] NOT NULL;