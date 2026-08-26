CREATE TABLE "po_approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_order" integer NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "po_approval_steps_step_order_unique" UNIQUE("step_order"),
	CONSTRAINT "po_approval_steps_order_check" CHECK ("po_approval_steps"."step_order" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_approvals_po_step_unique" UNIQUE("purchase_order_id","step_order")
);
--> statement-breakpoint
ALTER TABLE "po_approval_steps" ADD CONSTRAINT "po_approval_steps_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_approvals" ADD CONSTRAINT "purchase_order_approvals_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_approvals" ADD CONSTRAINT "purchase_order_approvals_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;