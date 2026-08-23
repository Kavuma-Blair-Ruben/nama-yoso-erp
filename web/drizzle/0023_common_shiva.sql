CREATE TABLE "pos_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"api_token" text,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_sales" ADD COLUMN "source" text DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_sales" ADD COLUMN "source_order_id" text;--> statement-breakpoint
ALTER TABLE "recipe_sales" ADD CONSTRAINT "recipe_sales_source_order_unique" UNIQUE("source","source_order_id");