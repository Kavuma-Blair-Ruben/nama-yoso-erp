CREATE TABLE "wastage_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_expense" boolean DEFAULT false NOT NULL,
	CONSTRAINT "wastage_reasons_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "wastage_reasons" ("name") VALUES
	('Spoilage'), ('Over-production'), ('Prep Loss'), ('Expired'),
	('Dropped/Damaged'), ('Quality Control Reject'), ('Other');
