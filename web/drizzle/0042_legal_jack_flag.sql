CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "is_packaging" boolean DEFAULT false NOT NULL;