CREATE TABLE "branch_receiving_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"frequency" text NOT NULL,
	CONSTRAINT "branch_receiving_limits_branch_id_unique" UNIQUE("branch_id"),
	CONSTRAINT "branch_receiving_limits_frequency_check" CHECK ("branch_receiving_limits"."frequency" in ('daily','weekly','monthly','quarterly'))
);
--> statement-breakpoint
CREATE TABLE "role_purchase_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"max_po_amount" numeric(14, 4),
	"max_grn_amount" numeric(14, 4),
	CONSTRAINT "role_purchase_limits_role_id_unique" UNIQUE("role_id")
);
--> statement-breakpoint
ALTER TABLE "branch_receiving_limits" ADD CONSTRAINT "branch_receiving_limits_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_purchase_limits" ADD CONSTRAINT "role_purchase_limits_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;