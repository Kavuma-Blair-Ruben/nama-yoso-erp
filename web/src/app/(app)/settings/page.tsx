import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listCategoriesWithSubcategories, listStorageAreas } from "@/server/db/queries/settings";
import { listCostCenters, listWastageReasons } from "@/server/db/queries/wastage";
import { listBranchesAdmin } from "@/server/db/queries/branches";
import { CategorySettings } from "@/components/settings/CategorySettings";
import { StorageAreaSettings } from "@/components/settings/StorageAreaSettings";
import { CostCenterSettings } from "@/components/settings/CostCenterSettings";
import { WastageReasonSettings } from "@/components/settings/WastageReasonSettings";
import { BranchSettings } from "@/components/settings/BranchSettings";

export default async function SettingsPage() {
  await requireSection("branchsettings", "view");
  const [categories, storageAreas, costCenters, reasons, branches] = await Promise.all([
    listCategoriesWithSubcategories(),
    listStorageAreas(),
    listCostCenters(),
    listWastageReasons(),
    listBranchesAdmin(),
  ]);

  return (
    <>
      <PageHeader title="Categories & Storage" subtitle="Manage branches, item categories, subcategories, storage areas, cost centers, and wastage reasons used throughout the system." />
      <div style={{ marginBottom: 16 }}>
        <BranchSettings branches={branches} />
      </div>
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
