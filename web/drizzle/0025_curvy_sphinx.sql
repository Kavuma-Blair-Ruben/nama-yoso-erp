ALTER TABLE "devices" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD COLUMN "expiry_extension_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD COLUMN "expiry_ticket_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "expiry_extension_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "expiry_ticket_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_expiry_extension_count_check" CHECK ("grn_lines"."expiry_extension_count" >= 0 and "grn_lines"."expiry_extension_count" <= 2);--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_expiry_extension_count_check" CHECK ("production_batches"."expiry_extension_count" >= 0 and "production_batches"."expiry_extension_count" <= 2);