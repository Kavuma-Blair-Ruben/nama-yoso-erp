CREATE SEQUENCE "public"."production_batch_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "production_batch_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_batch_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_label" text,
	"rate_at_production" numeric(14, 4),
	"amount_at_production" numeric(14, 4)
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_no" text NOT NULL,
	"lot_no" text NOT NULL,
	"sub_recipe_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"scale_multiplier" numeric(10, 4) DEFAULT 1 NOT NULL,
	"yield_qty" numeric(14, 4) NOT NULL,
	"yield_unit" text,
	"total_cost" numeric(14, 4) NOT NULL,
	"cost_per_unit" numeric(14, 4),
	"produced_date" date NOT NULL,
	"expiry_date" date,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_batches_batch_no_unique" UNIQUE("batch_no"),
	CONSTRAINT "production_batches_status_check" CHECK ("production_batches"."status" in ('DRAFT','POSTED'))
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"qty_on_hand" numeric(14, 4) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_item_branch_unique" UNIQUE("stock_item_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"qty_delta" numeric(14, 4) NOT NULL,
	"unit_label" text,
	"movement_type" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"balance_after" numeric(14, 4),
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_type_check" CHECK ("stock_movements"."movement_type" in ('GRN_RECEIPT','PRODUCTION_CONSUME','PRODUCTION_OUTPUT','WASTAGE','TRANSFER_OUT','TRANSFER_IN','STOCK_COUNT_ADJUSTMENT'))
);
--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD COLUMN "stockable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "production_batch_ingredients" ADD CONSTRAINT "production_batch_ingredients_production_batch_id_production_batches_id_fk" FOREIGN KEY ("production_batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_ingredients" ADD CONSTRAINT "production_batch_ingredients_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_sub_recipe_id_sub_recipes_id_fk" FOREIGN KEY ("sub_recipe_id") REFERENCES "public"."sub_recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_posted_by_profiles_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;