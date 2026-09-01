CREATE TABLE "ingredient_swap_event_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"recipe_type" text NOT NULL,
	"recipe_code" text NOT NULL,
	"recipe_name" text NOT NULL,
	"cost_before" numeric(14, 4) NOT NULL,
	"cost_after" numeric(14, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_swap_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_stock_item_id" uuid NOT NULL,
	"to_stock_item_id" uuid NOT NULL,
	"reason" text,
	"affected_line_count" integer NOT NULL,
	"total_cost_impact" numeric(14, 4) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_swap_event_lines" ADD CONSTRAINT "ingredient_swap_event_lines_event_id_ingredient_swap_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."ingredient_swap_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_swap_events" ADD CONSTRAINT "ingredient_swap_events_from_stock_item_id_stock_items_id_fk" FOREIGN KEY ("from_stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_swap_events" ADD CONSTRAINT "ingredient_swap_events_to_stock_item_id_stock_items_id_fk" FOREIGN KEY ("to_stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_swap_events" ADD CONSTRAINT "ingredient_swap_events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;