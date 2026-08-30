import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listUnitsOfMeasure } from "@/server/db/queries/settings";
import { UnitSettings } from "@/components/settings/UnitSettings";
import { withTimeout } from "@/lib/withTimeout";

export default async function UnitsPage() {
  await requireSection("branchsettings", "view");
  const units = await withTimeout(listUnitsOfMeasure(), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <>
      <PageHeader title="Units of Measurement" subtitle="Build your own units and assign them to products — used everywhere quantities are entered." />
      <UnitSettings units={units} />
    </>
  );
}
