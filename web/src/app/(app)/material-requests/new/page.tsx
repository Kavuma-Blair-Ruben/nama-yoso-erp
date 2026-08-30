import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { MaterialRequestBuilder } from "@/components/materialRequests/MaterialRequestBuilder";
import { MR_LOCATIONS } from "@/server/db/queries/materialRequests";
import { listIngredientPickerItems } from "@/server/db/queries/recipes";
import { withTimeout } from "@/lib/withTimeout";

export default async function NewMaterialRequestPage() {
  await requireSection("orders", "edit");
  const items = await withTimeout(listIngredientPickerItems(), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <>
      <PageHeader title="New Material Request" subtitle="Request stock from another location — routes for approval, then fulfillment." backHref="/material-requests" backLabel="Material Requests" />
      <MaterialRequestBuilder items={items} locations={MR_LOCATIONS} />
    </>
  );
}
