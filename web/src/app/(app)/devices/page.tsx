import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listDevices } from "@/server/db/queries/devices";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listPrintRoutingContext } from "@/server/db/queries/printRoutes";
import { isPrintNodeConfigured, listPrintNodePrinters } from "@/lib/printnode";
import { DeviceSettings } from "@/components/settings/DeviceSettings";
import { PrintRoutingSettings } from "@/components/settings/PrintRoutingSettings";
import { withTimeout } from "@/lib/withTimeout";

export default async function DevicesPage() {
  await requireSection("system", "view");
  // Sequential, not Promise.all — concurrent connection opens against the
  // Supabase pooler have been observed to hang under load (same reasoning
  // as dashboard.ts's cached queries).
  const devices = await withTimeout(listDevices(), 20000, "This is taking longer than expected — please try again in a moment.");
  const branches = await withTimeout(listBranches(), 20000, "This is taking longer than expected — please try again in a moment.");
  const printNode = await withTimeout(
    isPrintNodeConfigured() ? listPrintNodePrinters() : Promise.resolve({ printers: [] as never[] }),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );
  const routing = await withTimeout(listPrintRoutingContext(), 20000, "This is taking longer than expected — please try again in a moment.");
  const printNodePrinters = printNode.printers ?? [];

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Add and monitor every printer, scanner, and other piece of hardware connected across your branches — from any branch, as the administrator."
      />
      <DeviceSettings devices={devices} branches={branches} printNodePrinters={printNodePrinters} printNodeConfigured={isPrintNodeConfigured()} />
      <PrintRoutingSettings branches={routing.branches} devices={routing.devices} routes={routing.routes} />
    </>
  );
}
