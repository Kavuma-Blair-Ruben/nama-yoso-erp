import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SupplierForm } from "@/components/suppliers/SupplierForm";

export default async function NewSupplierPage() {
  await requireSection("suppliers", "edit");
  return (
    <>
      <PageHeader title="Add Supplier" subtitle="Create a new supplier that can be assigned to purchase orders and GRNs." backHref="/suppliers" backLabel="Suppliers" />
      <SupplierForm />
    </>
  );
}
