// A printed QR label encodes a full /products/{code} URL (so a phone's own
// camera app can open it directly without this app's scanner); a printed
// CODE128 barcode encodes the bare code. Extract the code from either shape.
export function extractProductCode(scanned: string): string {
  const match = scanned.match(/\/products\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : scanned;
}

// Every code this app prints is one of three things: a product (numeric
// legacyCode, e.g. "1023"), a lot (always "LOT-..." — covers both
// GRN-received and production lots, which getLotDetail already
// disambiguates internally), or a wastage/scrap ticket (always "WST-...").
// A phone-camera QR scan yields a full "{origin}/products/{code}" or
// "{origin}/lots/{lotNo}" URL; a barcode-gun scan yields the bare code with
// no URL. Check the URL shape first, then fall back to the bare-code
// prefix/format heuristic.
export function classifyScan(scanned: string): { type: "product" | "lot" | "wastage"; code: string } {
  const trimmed = scanned.trim();
  const productMatch = trimmed.match(/\/products\/([^/?#]+)/);
  if (productMatch) return { type: "product", code: decodeURIComponent(productMatch[1]) };
  const lotMatch = trimmed.match(/\/lots\/([^/?#]+)/);
  if (lotMatch) return { type: "lot", code: decodeURIComponent(lotMatch[1]) };
  if (/^LOT-/i.test(trimmed)) return { type: "lot", code: trimmed };
  if (/^WST-/i.test(trimmed)) return { type: "wastage", code: trimmed };
  return { type: "product", code: trimmed };
}
