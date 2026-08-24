CREATE TABLE "pos_branch_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_branch_id" text NOT NULL,
	"external_branch_name" text,
	"branch_id" uuid,
	"cost_center_id" uuid,
	CONSTRAINT "pos_branch_mappings_provider_branch_unique" UNIQUE("provider","external_branch_id")
);
--> statement-breakpoint
CREATE TABLE "pos_item_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_product_id" text NOT NULL,
	"external_product_name" text,
	"main_recipe_id" uuid,
	CONSTRAINT "pos_item_mappings_provider_product_unique" UNIQUE("provider","external_product_id")
);
--> statement-breakpoint
CREATE TABLE "pos_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_order_id" text NOT NULL,
	"event_type" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"process_notes" text,
	CONSTRAINT "pos_webhook_events_provider_order_unique" UNIQUE("provider","external_order_id")
);
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_type_check";--> statement-breakpoint
ALTER TABLE "pos_integrations" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "pos_branch_mappings" ADD CONSTRAINT "pos_branch_mappings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_branch_mappings" ADD CONSTRAINT "pos_branch_mappings_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_item_mappings" ADD CONSTRAINT "pos_item_mappings_main_recipe_id_main_recipes_id_fk" FOREIGN KEY ("main_recipe_id") REFERENCES "public"."main_recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_type_check" CHECK ("stock_movements"."movement_type" in ('GRN_RECEIPT','PRODUCTION_CONSUME','PRODUCTION_OUTPUT','WASTAGE','TRANSFER_OUT','TRANSFER_IN','STOCK_COUNT_ADJUSTMENT','CK_SALE','CUSTOMER_RETURN','SUPPLIER_RETURN','POS_SALE'));