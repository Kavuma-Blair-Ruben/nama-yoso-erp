import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsolidateBuilder } from "@/components/grn/ConsolidateBuilder";
import { listConsolidatableGrnsBySupplier } from "@/server/db/queries/grn";

export default async function NewConsolidatedInvoicePage() {
  await requireSection("grn", "edit");
  const groups = await listConsolidatableGrnsBySupplier();

  return (
    <>
      <PageHeader title="New Consolidated Invoice" subtitle="Combine multiple GRNs for the same supplier into a single consolidated invoice." backHref="/consolidated-invoices" backLabel="Consolidated Invoices" />
      <ConsolidateBuilder groups={groups} />
    </>
  );
}
