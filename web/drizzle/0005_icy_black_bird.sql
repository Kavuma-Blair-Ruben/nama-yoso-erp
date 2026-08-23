ALTER TABLE "recipe_ingredients" ADD COLUMN "wastage_pct" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD COLUMN "shelf_life_days" integer;--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD COLUMN "storage_instructions" text;