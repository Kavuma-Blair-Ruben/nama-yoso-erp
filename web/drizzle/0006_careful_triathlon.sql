CREATE SEQUENCE "public"."stock_count_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."transfer_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."wastage_event_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"system_qty" numeric(14, 4) NOT NULL,
	"counted_qty" numeric(14, 4),
	"unit_label" text,
	"rate_at_count" numeric(14, 4)
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_no" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"cost_center" text,
	"count_date" date NOT NULL,
	"staff_name" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"total_variance_value" numeric(14, 4) DEFAULT 0 NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_counts_count_no_unique" UNIQUE("count_no"),
	CONSTRAINT "stock_counts_status_check" CHECK ("stock_counts"."status" in ('DRAFT','POSTED'))
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_transfer_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_label" text,
	"rate_at_transfer" numeric(14, 4),
	"amount_at_transfer" numeric(14, 4)
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_no" text NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"transfer_date" date NOT NULL,
	"staff_name" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"total_cost" numeric(14, 4) DEFAULT 0 NOT NULL,
	"notes" text,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_transfers_transfer_no_unique" UNIQUE("transfer_no"),
	CONSTRAINT "stock_transfers_status_check" CHECK ("stock_transfers"."status" in ('DRAFT','POSTED')),
	CONSTRAINT "stock_transfers_branch_check" CHECK ("stock_transfers"."from_branch_id" <> "stock_transfers"."to_branch_id")
);
--> statement-breakpoint
CREATE TABLE "wastage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wastage_no" text NOT NULL,
	"event_date" date NOT NULL,
	"cost_center" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"staff_name" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"total_cost" numeric(14, 4) DEFAULT 0 NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wastage_events_wastage_no_unique" UNIQUE("wastage_no"),
	CONSTRAINT "wastage_events_status_check" CHECK ("wastage_events"."status" in ('DRAFT','POSTED'))
);
--> statement-breakpoint
CREATE TABLE "wastage_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wastage_event_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_label" text,
	"reason" text NOT NULL,
	"notes" text,
	"rate_at_waste" numeric(14, 4),
	"amount_at_waste" numeric(14, 4)
);
--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_posted_by_profiles_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_stock_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("stock_transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_posted_by_profiles_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_events" ADD CONSTRAINT "wastage_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_events" ADD CONSTRAINT "wastage_events_posted_by_profiles_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_events" ADD CONSTRAINT "wastage_events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_lines" ADD CONSTRAINT "wastage_lines_wastage_event_id_wastage_events_id_fk" FOREIGN KEY ("wastage_event_id") REFERENCES "public"."wastage_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_lines" ADD CONSTRAINT "wastage_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;