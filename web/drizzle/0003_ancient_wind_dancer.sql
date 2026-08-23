ALTER TABLE "grns" ADD COLUMN "payment_status" text DEFAULT 'OUTSTANDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "grns" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "grns" ADD COLUMN "paid_by" uuid;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_paid_by_profiles_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_payment_status_check" CHECK ("grns"."payment_status" in ('OUTSTANDING','PAID'));