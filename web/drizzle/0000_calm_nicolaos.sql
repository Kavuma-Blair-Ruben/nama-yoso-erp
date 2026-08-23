CREATE TYPE "public"."storage_type" AS ENUM('DRY', 'CHILLED', 'FROZEN');--> statement-breakpoint
CREATE SEQUENCE "public"."batch_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."grn_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."lot_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."po_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_label" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "cost_centers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "daily_sales_historical" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_date" date NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	CONSTRAINT "daily_sales_historical_sales_date_unique" UNIQUE("sales_date")
);
--> statement-breakpoint
CREATE TABLE "grn_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_id" uuid NOT NULL,
	"purchase_order_line_id" uuid,
	"stock_item_id" uuid NOT NULL,
	"unit_label" text,
	"ordered_qty" numeric(14, 4),
	"received_qty" numeric(14, 4) NOT NULL,
	"rate" numeric(14, 4) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 5 NOT NULL,
	"is_foc" boolean DEFAULT false NOT NULL,
	"batch_no" text,
	"lot_no" text,
	"mfg_date" date,
	"expiry_date" date,
	"condition" text DEFAULT 'ACCEPTED' NOT NULL,
	"line_amount" numeric(14, 4) NOT NULL,
	CONSTRAINT "grn_lines_condition_check" CHECK ("grn_lines"."condition" in ('ACCEPTED','DAMAGED','REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "grns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_number" text NOT NULL,
	"purchase_order_id" uuid,
	"supplier_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"received_date" date NOT NULL,
	"invoice_number" text,
	"invoice_due_date" date,
	"attachment_url" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grns_grn_number_unique" UNIQUE("grn_number"),
	CONSTRAINT "grns_status_check" CHECK ("grns"."status" in ('DRAFT','POSTED'))
);
--> statement-breakpoint
CREATE TABLE "invoices_historical" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_date" date,
	"supplier_id" uuid,
	"invoice_number" text,
	"net" numeric(14, 4),
	"vat" numeric(14, 4),
	"total" numeric(14, 4),
	"terms" text,
	"terms_normalized" text,
	"week_label" text,
	"status" text,
	CONSTRAINT "invoices_historical_status_check" CHECK ("invoices_historical"."status" in ('OUTSTANDING','PAID','OTHER'))
);
--> statement-breakpoint
CREATE TABLE "main_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_code" text NOT NULL,
	"name" text NOT NULL,
	"section" text,
	"yield_qty" numeric(14, 4),
	"yield_unit" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "main_recipes_legacy_code_unique" UNIQUE("legacy_code")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"old_rate" numeric(14, 4),
	"new_rate" numeric(14, 4),
	"reason" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "price_history_source_check" CHECK ("price_history"."source" in ('manual','grn','bulk'))
);
--> statement-breakpoint
CREATE TABLE "product_supplier_packaging" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_unit" text,
	"unit_weight" numeric(14, 4),
	"rate" numeric(14, 4),
	"supplier_item_name" text,
	"supplier_item_code" text,
	"is_priority" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"branches" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_lines_historical" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"purchase_date" date,
	"supplier_id" uuid,
	"item_label" text,
	"unit_label" text,
	"qty" numeric(14, 4),
	"rate" numeric(14, 4),
	"amount" numeric(14, 4),
	"section" text,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"unit_label" text,
	"qty" numeric(14, 4) NOT NULL,
	"rate" numeric(14, 4) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT 5 NOT NULL,
	"packaging_variant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"deliver_to" text,
	"notes" text,
	"tax_rate_default" numeric(5, 2) DEFAULT 5 NOT NULL,
	"created_by" uuid,
	"created_date" date DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number"),
	CONSTRAINT "purchase_orders_status_check" CHECK ("purchase_orders"."status" in ('DRAFT','APPROVED','ORDERED','PARTIALLY RECEIVED','FULLY RECEIVED','CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"main_recipe_id" uuid,
	"sub_recipe_id" uuid,
	"stock_item_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"unit_label" text,
	"qty" numeric(14, 6) NOT NULL,
	"rate_at_build" numeric(14, 4),
	"amount_at_build" numeric(14, 4),
	"ingredient_weight_g" numeric(14, 4),
	"last_price" numeric(14, 4),
	CONSTRAINT "recipe_ingredients_exactly_one_parent" CHECK ((case when "recipe_ingredients"."main_recipe_id" is null then 0 else 1 end) + (case when "recipe_ingredients"."sub_recipe_id" is null then 0 else 1 end) = 1)
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_section_key_pk" PRIMARY KEY("role_id","section_key"),
	CONSTRAINT "role_permissions_section_key_check" CHECK ("role_permissions"."section_key" in ('branchsettings','items','suppliers','orders','grn','ckwarehouse','recipes','subrecipes','wastage','transfers','stockcount','reports','system','policies','permissions')),
	CONSTRAINT "role_permissions_level_check" CHECK ("role_permissions"."level" in ('edit','view','none'))
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_code" text NOT NULL,
	"source_type" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"subcategory_id" uuid,
	"storage_type" "storage_type",
	"storage_type_raw" text,
	"supplier_id" uuid,
	"purchase_unit" text,
	"issue_unit" text,
	"unit_weight" numeric(14, 4),
	"yield_pct" numeric(7, 4) DEFAULT 1 NOT NULL,
	"net_recovered_qty" numeric(14, 4),
	"purchase_rate" numeric(14, 4),
	"rate_per_kg_l" numeric(14, 6),
	"rate_per_g_ml" numeric(14, 8),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_items_legacy_code_unique" UNIQUE("legacy_code"),
	CONSTRAINT "stock_items_source_type_check" CHECK ("stock_items"."source_type" in ('purchased','produced'))
);
--> statement-breakpoint
CREATE TABLE "storage_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "storage_areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sub_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_code" text NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"section" text,
	"yield_qty" numeric(14, 4),
	"yield_unit" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_recipes_legacy_code_unique" UNIQUE("legacy_code"),
	CONSTRAINT "sub_recipes_stock_item_id_unique" UNIQUE("stock_item_id")
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "subcategories_category_id_name_unique" UNIQUE("category_id","name")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legacy_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"trn" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"payment_terms" text,
	"lead_time_days" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pct" numeric(5, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units_of_measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"factor" numeric(14, 6) NOT NULL,
	CONSTRAINT "units_of_measure_code_unique" UNIQUE("code"),
	CONSTRAINT "units_of_measure_type_check" CHECK ("units_of_measure"."type" in ('weight','volume','count'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_posted_by_profiles_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices_historical" ADD CONSTRAINT "invoices_historical_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_supplier_packaging" ADD CONSTRAINT "product_supplier_packaging_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_supplier_packaging" ADD CONSTRAINT "product_supplier_packaging_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hand-added: drizzle doesn't manage the `auth` schema (owned by Supabase Auth),
-- so this FK is added manually rather than via a drizzle-kit-generated stub table.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines_historical" ADD CONSTRAINT "purchase_lines_historical_invoice_id_invoices_historical_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices_historical"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines_historical" ADD CONSTRAINT "purchase_lines_historical_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_packaging_variant_id_product_supplier_packaging_id_fk" FOREIGN KEY ("packaging_variant_id") REFERENCES "public"."product_supplier_packaging"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_main_recipe_id_main_recipes_id_fk" FOREIGN KEY ("main_recipe_id") REFERENCES "public"."main_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_sub_recipe_id_sub_recipes_id_fk" FOREIGN KEY ("sub_recipe_id") REFERENCES "public"."sub_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD CONSTRAINT "sub_recipes_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-added: deny-by-default RLS on every table. The app connects via
-- DATABASE_URL as the `postgres` role (BYPASSRLS), so this is a safety net
-- against the exposed anon key reaching these tables through Supabase's
-- auto-generated PostgREST API, not the actual permission enforcement
-- (that's the role_permissions-driven checks in src/server/auth).
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subcategories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_centers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "storage_areas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "units_of_measure" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_supplier_packaging" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "main_recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grn_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices_historical" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_lines_historical" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_sales_historical" ENABLE ROW LEVEL SECURITY;