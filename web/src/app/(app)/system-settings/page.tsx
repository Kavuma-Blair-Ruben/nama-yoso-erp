import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listTaxRates, getSystemSettings } from "@/server/db/queries/settings";
import { listDevices } from "@/server/db/queries/devices";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { TaxRateSettings } from "@/components/settings/TaxRateSettings";
import { CostingMethodSettings } from "@/components/settings/CostingMethodSettings";
import { BlindCountSettings } from "@/components/settings/BlindCountSettings";
import { DeviceSettings } from "@/components/settings/DeviceSettings";

export default async function SystemSettingsPage() {
  await requireSection("system", "view");
  const [taxRates, settings, devices, branches] = await Promise.all([listTaxRates(), getSystemSettings(), listDevices(), listBranches()]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Tax rates, costing method, and hardware devices — system-wide configuration." />
      <div className="grid-2">
        <TaxRateSettings taxRates={taxRates} />
        <CostingMethodSettings costingMethod={settings.costingMethod as "latest" | "moving_average" | "weighted_average"} />
        <BlindCountSettings blindCounts={settings.blindCounts} />
      </div>
      <DeviceSettings devices={devices} branches={branches} />
    </>
  );
}
