ALTER TABLE "main_recipes" ADD COLUMN "selling_price" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "main_recipes" ADD COLUMN "target_food_cost_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "main_recipes" ADD COLUMN "cook_book_text" text;--> statement-breakpoint
ALTER TABLE "main_recipes" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "accounting_category" text;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "secondary_name" text;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "branches" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "min_level" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "preferred_counting_unit" text;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "default_prep_wastage_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "item_tax_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "non_cogs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD COLUMN "cook_book_text" text;--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD COLUMN "photo_url" text;