CREATE TABLE "daily_guest_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"guest_count" integer NOT NULL,
	"notes" text,
	"entered_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_guest_counts_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "daily_guest_counts" ADD CONSTRAINT "daily_guest_counts_entered_by_profiles_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;