import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listUnitsOfMeasure } from "@/server/db/queries/settings";
import { UnitSettings } from "@/components/settings/UnitSettings";

export default async function UnitsPage() {
  await requireSection("branchsettings", "view");
  const units = await listUnitsOfMeasure();

  return (
    <>
      <PageHeader title="Units of Measurement" subtitle="Build your own units and assign them to products — used everywhere quantities are entered." />
      <UnitSettings units={units} />
    </>
  );
}
