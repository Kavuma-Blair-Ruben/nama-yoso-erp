ALTER TABLE "main_recipes" ADD COLUMN "is_combo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD COLUMN "is_modifier" boolean DEFAULT false NOT NULL;