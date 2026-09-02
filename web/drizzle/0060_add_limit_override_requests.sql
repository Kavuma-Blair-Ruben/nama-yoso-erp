CREATE TABLE "limit_override_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"request_type" text NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"context" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limit_override_requests_type_check" CHECK ("limit_override_requests"."request_type" in ('PO','GRN')),
	CONSTRAINT "limit_override_requests_status_check" CHECK ("limit_override_requests"."status" in ('PENDING','APPROVED','DENIED'))
);
--> statement-breakpoint
CREATE TABLE "purchase_limit_approvers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_limit_approvers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "limit_override_requests" ADD CONSTRAINT "limit_override_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_override_requests" ADD CONSTRAINT "limit_override_requests_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_limit_approvers" ADD CONSTRAINT "purchase_limit_approvers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;