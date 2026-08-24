import Link from "next/link";
import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listTaxRates, getSystemSettings } from "@/server/db/queries/settings";
import { TaxRateSettings } from "@/components/settings/TaxRateSettings";
import { CostingMethodSettings } from "@/components/settings/CostingMethodSettings";
import { BlindCountSettings } from "@/components/settings/BlindCountSettings";

export default async function SystemSettingsPage() {
  await requireSection("system", "view");
  const [taxRates, settings] = await Promise.all([listTaxRates(), getSystemSettings()]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Tax rates, costing method, and blind counts — system-wide configuration." />
      <div className="grid-2">
        <TaxRateSettings taxRates={taxRates} />
        <CostingMethodSettings costingMethod={settings.costingMethod as "latest" | "moving_average" | "weighted_average"} />
        <BlindCountSettings blindCounts={settings.blindCounts} />
      </div>
      <div className="panel">
        <div className="panel-head"><h3>Hardware Devices</h3></div>
        <div className="panel-body">
          <div className="callout">
            Printers, scanners, and other hardware now have their own monitoring dashboard.{" "}
            <Link href="/devices">Open Devices →</Link>
          </div>
        </div>
      </div>
    </>
  );
}
