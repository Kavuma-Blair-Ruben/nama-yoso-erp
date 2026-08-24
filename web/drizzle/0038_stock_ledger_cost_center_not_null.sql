ALTER TABLE "stock_balances" ALTER COLUMN "cost_center_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "cost_center_id" SET NOT NULL;