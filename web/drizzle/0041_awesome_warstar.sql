CREATE TABLE "pos_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_order_id" text NOT NULL,
	"branch_id" uuid,
	"sale_date" date NOT NULL,
	"gross_amount" numeric(14, 4) DEFAULT 0 NOT NULL,
	"discount_amount" numeric(14, 4) DEFAULT 0 NOT NULL,
	"net_amount" numeric(14, 4) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_orders_provider_order_unique" UNIQUE("provider","external_order_id")
);
--> statement-breakpoint
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;