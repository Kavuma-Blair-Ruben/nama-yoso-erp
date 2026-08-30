import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsolidateBuilder } from "@/components/grn/ConsolidateBuilder";
import { listConsolidatableGrnsBySupplier } from "@/server/db/queries/grn";
import { withTimeout } from "@/lib/withTimeout";

export default async function NewConsolidatedInvoicePage() {
  await requireSection("grn", "edit");
  const groups = await withTimeout(listConsolidatableGrnsBySupplier(), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <>
      <PageHeader title="New Consolidated Invoice" subtitle="Combine multiple GRNs for the same supplier into a single consolidated invoice." backHref="/consolidated-invoices" backLabel="Consolidated Invoices" />
      <ConsolidateBuilder groups={groups} />
    </>
  );
}
