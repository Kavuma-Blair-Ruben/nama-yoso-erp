CREATE TABLE "recipe_branch_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"main_recipe_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"selling_price" numeric(14, 4) NOT NULL,
	CONSTRAINT "recipe_branch_prices_recipe_branch_unique" UNIQUE("main_recipe_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "recipe_branch_prices" ADD CONSTRAINT "recipe_branch_prices_main_recipe_id_main_recipes_id_fk" FOREIGN KEY ("main_recipe_id") REFERENCES "public"."main_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_branch_prices" ADD CONSTRAINT "recipe_branch_prices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;