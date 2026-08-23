CREATE TABLE "location_order_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location" text NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"frequency" text NOT NULL,
	CONSTRAINT "location_order_limits_location_unique" UNIQUE("location"),
	CONSTRAINT "location_order_limits_frequency_check" CHECK ("location_order_limits"."frequency" in ('daily','weekly','monthly','quarterly'))
);
--> statement-breakpoint
CREATE TABLE "policy_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"above_par_over_pct" numeric(7, 2),
	"receive_above_price_pct" numeric(7, 2),
	"internal_only_locations" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "order_limit_amount" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "order_limit_frequency" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "receiving_limit_amount" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "receiving_limit_frequency" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_order_limit_frequency_check" CHECK ("suppliers"."order_limit_frequency" is null or "suppliers"."order_limit_frequency" in ('daily','weekly','monthly'));--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_receiving_limit_frequency_check" CHECK ("suppliers"."receiving_limit_frequency" is null or "suppliers"."receiving_limit_frequency" in ('daily','weekly','monthly'));