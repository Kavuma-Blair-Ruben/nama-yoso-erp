CREATE SEQUENCE "public"."mr_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "material_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_request_id" uuid NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_label" text
);
--> statement-breakpoint
CREATE TABLE "material_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mr_number" text NOT NULL,
	"from_location" text NOT NULL,
	"to_location" text NOT NULL,
	"required_date" date NOT NULL,
	"status" text DEFAULT 'PENDING APPROVAL' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	CONSTRAINT "material_requests_mr_number_unique" UNIQUE("mr_number"),
	CONSTRAINT "material_requests_status_check" CHECK ("material_requests"."status" in ('PENDING APPROVAL','APPROVED','REJECTED','FULFILLED'))
);
--> statement-breakpoint
ALTER TABLE "material_request_lines" ADD CONSTRAINT "material_request_lines_material_request_id_material_requests_id_fk" FOREIGN KEY ("material_request_id") REFERENCES "public"."material_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_request_lines" ADD CONSTRAINT "material_request_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;