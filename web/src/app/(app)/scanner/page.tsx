import { requireAuth } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ScannerClient } from "@/components/scanner/ScannerClient";

export default async function ScannerPage() {
  await requireAuth(); // read-mostly lookup tool, open to anyone signed in — the
  // one write action (closing a production ticket) stays protected by
  // closeProductionBatchByLot's own assertPermission regardless.
  return (
    <>
      <PageHeader title="Scanner" subtitle="Scan a product, batch, or lot barcode/QR to see its details." />
      <ScannerClient />
    </>
  );
}
