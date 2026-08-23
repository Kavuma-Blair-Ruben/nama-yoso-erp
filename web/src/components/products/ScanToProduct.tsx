"use client";

import { useRouter } from "next/navigation";
import { ScanInput } from "@/components/ui/ScanInput";
import { extractProductCode } from "@/lib/scanCode";

export function ScanToProduct() {
  const router = useRouter();
  return (
    <div style={{ maxWidth: 420, marginBottom: 14 }}>
      <ScanInput placeholder="Scan a product barcode/QR, or type its code…" onScan={(scanned) => router.push(`/products/${encodeURIComponent(extractProductCode(scanned))}`)} autoFocus={false} />
    </div>
  );
}
