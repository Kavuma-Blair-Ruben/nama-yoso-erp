CREATE TABLE "print_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"device_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_routes_branch_doctype_unique" UNIQUE("branch_id","document_type"),
	CONSTRAINT "print_routes_document_type_check" CHECK ("print_routes"."document_type" in ('expiry_ticket','production_label','wastage_ticket'))
);
--> statement-breakpoint
ALTER TABLE "print_routes" ADD CONSTRAINT "print_routes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_routes" ADD CONSTRAINT "print_routes_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;