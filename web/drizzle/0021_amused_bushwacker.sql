ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_status_check";--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "sent_by" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_sent_by_profiles_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_status_check" CHECK ("stock_transfers"."status" in ('DRAFT','IN_TRANSIT','POSTED'));