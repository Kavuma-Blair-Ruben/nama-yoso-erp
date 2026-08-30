import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listCustomers, listPriceLists } from "@/server/db/queries/ckSales";
import { CustomerSettings } from "@/components/ckSales/CustomerSettings";
import { withTimeout } from "@/lib/withTimeout";

export default async function CustomersPage() {
  await requireSection("ckwarehouse", "view");
  const [customers, priceLists] = await withTimeout(Promise.all([listCustomers(), listPriceLists()]), 20000, "This is taking longer than expected — please try again in a moment.");

  return (
    <>
      <PageHeader title="Customers" subtitle="Internal branches and external customers you invoice or deliver to from Central Kitchen." />
      <CustomerSettings customers={customers} priceLists={priceLists} />
    </>
  );
}
