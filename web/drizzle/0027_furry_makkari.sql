ALTER TABLE "devices" DROP CONSTRAINT "devices_connection_check";--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "printnode_printer_id" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_connection_check" CHECK ("devices"."connection" in ('network','bluetooth','wifi_direct','printnode','other'));