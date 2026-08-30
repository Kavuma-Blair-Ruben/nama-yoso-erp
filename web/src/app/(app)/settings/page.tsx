import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listCategoriesWithSubcategories, listStorageAreas } from "@/server/db/queries/settings";
import { listWastageReasons } from "@/server/db/queries/wastage";
import { listBranchesAdmin } from "@/server/db/queries/branches";
import { listCostCentersAdmin } from "@/server/db/queries/costCenters";
import { CategorySettings } from "@/components/settings/CategorySettings";
import { StorageAreaSettings } from "@/components/settings/StorageAreaSettings";
import { CostCenterSettings } from "@/components/settings/CostCenterSettings";
import { WastageReasonSettings } from "@/components/settings/WastageReasonSettings";
import { BranchSettings } from "@/components/settings/BranchSettings";
import { withTimeout } from "@/lib/withTimeout";

export default async function SettingsPage() {
  await requireSection("branchsettings", "view");
  const [categories, storageAreas, costCenters, reasons, branches] = await withTimeout(
    Promise.all([listCategoriesWithSubcategories(), listStorageAreas(), listCostCentersAdmin(), listWastageReasons(), listBranchesAdmin()]),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );

  return (
    <>
      <PageHeader title="Categories & Storage" subtitle="Manage branches, item categories, subcategories, storage areas, cost centers, and wastage reasons used throughout the system." />
      <div style={{ marginBottom: 16 }}>
        <BranchSettings branches={branches} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <CostCenterSettings branches={branches} costCenters={costCenters} />
      </div>
      <div className="grid-2">
        <CategorySettings categories={categories} />
        <StorageAreaSettings storageAreas={storageAreas} />
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <WastageReasonSettings reasons={reasons} />
      </div>
    </>
  );
}
