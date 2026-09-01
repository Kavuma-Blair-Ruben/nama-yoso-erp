ALTER TABLE "recipe_sales" ADD COLUMN "gross_revenue" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "recipe_sales" ADD COLUMN "discount_amount" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "recipe_sales" ADD COLUMN "void_amount" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "recipe_sales" ADD COLUMN "void_qty" numeric(14, 2);