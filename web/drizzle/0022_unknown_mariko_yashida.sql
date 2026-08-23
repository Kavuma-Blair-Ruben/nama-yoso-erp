CREATE TABLE "recipe_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_date" date NOT NULL,
	"main_recipe_id" uuid,
	"item_label" text NOT NULL,
	"qty" numeric(14, 2) NOT NULL,
	"revenue" numeric(14, 4) NOT NULL,
	"imported_by" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_sales" ADD CONSTRAINT "recipe_sales_main_recipe_id_main_recipes_id_fk" FOREIGN KEY ("main_recipe_id") REFERENCES "public"."main_recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_sales" ADD CONSTRAINT "recipe_sales_imported_by_profiles_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;