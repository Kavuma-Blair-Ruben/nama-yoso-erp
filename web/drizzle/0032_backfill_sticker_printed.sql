-- Backfill: mark every line on an already-POSTED GRN as already having its
-- sticker printed, so the new auto-print-on-post feature doesn't retroactively
-- fire a print job the next time someone opens an old, already-received GRN.
-- Lines on GRNs still in DRAFT are left untouched — auto-print should
-- correctly fire for those once they're actually posted going forward.
UPDATE "grn_lines" SET "sticker_printed_at" = now()
WHERE "sticker_printed_at" IS NULL
  AND "grn_id" IN (SELECT "id" FROM "grns" WHERE "status" = 'POSTED');
