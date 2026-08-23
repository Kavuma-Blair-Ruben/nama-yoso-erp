CREATE TABLE "stock_count_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cost_center" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "blind_counts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_count_template_items" ADD CONSTRAINT "stock_count_template_items_template_id_stock_count_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."stock_count_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_template_items" ADD CONSTRAINT "stock_count_template_items_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_templates" ADD CONSTRAINT "stock_count_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;