"use server";

import { requireAuth } from "@/server/auth/permissions";
import { getProductByCode } from "@/server/db/queries/products";
import { getLotDetail } from "@/server/db/queries/grn";
import { getWastageEventByNumber } from "@/server/db/queries/wastage";
import { classifyScan } from "@/lib/scanCode";

export type ScanResult =
  | { type: "product"; code: string; data: NonNullable<Awaited<ReturnType<typeof getProductByCode>>> }
  | { type: "lot"; code: string; data: NonNullable<Awaited<ReturnType<typeof getLotDetail>>> }
  | { type: "wastage"; code: string; data: NonNullable<Awaited<ReturnType<typeof getWastageEventByNumber>>> }
  | { type: "unknown"; code: string };

// One entry point for "what is this code" — classifies a raw scanned string
// (barcode-gun or camera-QR, see classifyScan) and reuses the exact same
// lookups the Product, Lot, and Wastage pages already use. Falls back to
// trying the other lookups if the first guess comes up empty, so a
// misclassified edge case still resolves rather than showing "not found".
export async function scanLookup(rawCode: string): Promise<ScanResult> {
  await requireAuth();
  const { type, code } = classifyScan(rawCode);

  if (type === "wastage") {
    const wastage = await getWastageEventByNumber(code);
    if (wastage) return { type: "wastage", code, data: wastage };
    return { type: "unknown", code };
  }

  if (type === "product") {
    const product = await getProductByCode(code);
    if (product) return { type: "product", code, data: product };
    const lot = await getLotDetail(code);
    if (lot) return { type: "lot", code, data: lot };
    return { type: "unknown", code };
  }

  const lot = await getLotDetail(code);
  if (lot) return { type: "lot", code, data: lot };
  const product = await getProductByCode(code);
  if (product) return { type: "product", code, data: product };
  return { type: "unknown", code };
}
