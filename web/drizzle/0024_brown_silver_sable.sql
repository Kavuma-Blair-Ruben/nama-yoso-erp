CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"connection" text NOT NULL,
	"address" text,
	"branch_id" uuid,
	"notes" text,
	"last_tested_at" timestamp with time zone,
	"last_test_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_type_check" CHECK ("devices"."type" in ('label_printer','receipt_printer','barcode_scanner','other')),
	CONSTRAINT "devices_connection_check" CHECK ("devices"."connection" in ('network','bluetooth','wifi_direct','other'))
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;