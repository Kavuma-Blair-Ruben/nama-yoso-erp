import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listDevices } from "@/server/db/queries/devices";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { isPrintNodeConfigured, listPrintNodePrinters } from "@/lib/printnode";
import { DeviceSettings } from "@/components/settings/DeviceSettings";

export default async function DevicesPage() {
  await requireSection("system", "view");
  const [devices, branches, printNode] = await Promise.all([
    listDevices(),
    listBranches(),
    isPrintNodeConfigured() ? listPrintNodePrinters() : Promise.resolve({ printers: [] as never[] }),
  ]);
  const printNodePrinters = printNode.printers ?? [];

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Add and monitor every printer, scanner, and other piece of hardware connected across your branches — from any branch, as the administrator."
      />
      <DeviceSettings devices={devices} branches={branches} printNodePrinters={printNodePrinters} printNodeConfigured={isPrintNodeConfigured()} />
    </>
  );
}
