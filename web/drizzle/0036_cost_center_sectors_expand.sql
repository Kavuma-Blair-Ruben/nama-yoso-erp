ALTER TABLE "cost_centers" DROP CONSTRAINT "cost_centers_name_unique";--> statement-breakpoint
ALTER TABLE "stock_balances" DROP CONSTRAINT "stock_balances_item_branch_unique";--> statement-breakpoint
ALTER TABLE "cost_centers" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "grns" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "from_cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "to_cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "wastage_events" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("from_cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("to_cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_events" ADD CONSTRAINT "wastage_events_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_branch_name_unique" UNIQUE("branch_id","name");--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_branch_costcenter_unique" UNIQUE("stock_item_id","branch_id","cost_center_id");