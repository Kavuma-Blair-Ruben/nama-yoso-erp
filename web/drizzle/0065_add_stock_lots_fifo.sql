CREATE TABLE "stock_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"cost_center_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_ref_id" uuid,
	"lot_no" text,
	"rate_per_kg_l" numeric(14, 6) NOT NULL,
	"qty_received" numeric(14, 4) NOT NULL,
	"qty_remaining" numeric(14, 4) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_lots_source_type_check" CHECK ("stock_lots"."source_type" in ('grn','production','transfer_in','customer_return','stock_count','opening_balance','deficit'))
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "cost_per_unit" numeric(14, 6);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "total_cost" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;