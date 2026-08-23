// A printed QR label encodes a full /products/{code} URL (so a phone's own
// camera app can open it directly without this app's scanner); a printed
// CODE128 barcode encodes the bare code. Extract the code from either shape.
export function extractProductCode(scanned: string): string {
  const match = scanned.match(/\/products\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : scanned;
}
