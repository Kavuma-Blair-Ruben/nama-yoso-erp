import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listCategoriesWithSubcategories, listStorageAreas } from "@/server/db/queries/settings";
import { listCostCenters, listWastageReasons } from "@/server/db/queries/wastage";
import { CategorySettings } from "@/components/settings/CategorySettings";
import { StorageAreaSettings } from "@/components/settings/StorageAreaSettings";
import { CostCenterSettings } from "@/components/settings/CostCenterSettings";
import { WastageReasonSettings } from "@/components/settings/WastageReasonSettings";

export default async function SettingsPage() {
  await requireSection("branchsettings", "view");
  const [categories, storageAreas, costCenters, reasons] = await Promise.all([
    listCategoriesWithSubcategories(),
    listStorageAreas(),
    listCostCenters(),
    listWastageReasons(),
  ]);

  return (
    <>
      <PageHeader title="Categories & Storage" subtitle="Manage item categories, subcategories, storage areas, cost centers, and wastage reasons used throughout the system." />
      <div className="grid-2">
        <CategorySettings categories={categories} />
        <StorageAreaSettings storageAreas={storageAreas} />
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <CostCenterSettings costCenters={costCenters} />
        <WastageReasonSettings reasons={reasons} />
      </div>
    </>
  );
}
