CREATE TABLE "system_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"costing_method" text DEFAULT 'latest' NOT NULL,
	CONSTRAINT "system_settings_costing_method_check" CHECK ("system_settings"."costing_method" in ('latest','moving_average','weighted_average'))
);
