ALTER TABLE "production_batches" DROP CONSTRAINT "production_batches_status_check";--> statement-breakpoint
UPDATE "production_batches" SET "status" = 'OPEN' WHERE "status" = 'DRAFT';--> statement-breakpoint
UPDATE "production_batches" SET "status" = 'CLOSED' WHERE "status" = 'POSTED';--> statement-breakpoint
ALTER TABLE "production_batches" ALTER COLUMN "status" SET DEFAULT 'OPEN';--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_status_check" CHECK ("production_batches"."status" in ('OPEN','CLOSED'));