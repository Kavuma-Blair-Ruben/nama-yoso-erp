import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { GRNBuilder } from "@/components/grn/GRNBuilder";
import { getPOLinesForReceiving } from "@/server/db/queries/grn";
import { listPurchasableProductsForPicker, listAllSuppliers, listBranches } from "@/server/db/queries/purchaseOrders";
import { notFound } from "next/navigation";

export default async function NewGrnPage({ searchParams }: PageProps<"/grn/new">) {
  await requireSection("grn", "edit");
  const sp = await searchParams;
  const poId = typeof sp.poId === "string" ? sp.poId : null;

  if (poId) {
    const data = await getPOLinesForReceiving(poId);
    if (!data) notFound();
    const { po, lines } = data;
    const initialLines = lines.map((l) => ({
      stockItemId: l.stockItemId,
      purchaseOrderLineId: l.id,
      name: l.name,
      unitLabel: l.unitLabel ?? "",
      orderedQty: l.qty,
      alreadyReceived: l.alreadyReceived,
      receivedQty: Math.max(l.qty - l.alreadyReceived, 0),
      rate: l.rate,
      discountPct: 0,
      taxRate: l.taxRate,
      isFoc: false,
      expiryDate: "",
      condition: "ACCEPTED" as const,
      currentRate: l.currentRate,
    }));
    return (
      <>
        <PageHeader title="Receive Stock" subtitle={`${po.poNumber} — ${po.supplier}`} />
        <GRNBuilder
          mode="po"
          poId={po.id}
          poNumber={po.poNumber}
          supplierId={po.supplierId}
          supplierName={po.supplier}
          branchId={po.branchId}
          initialLines={initialLines}
          suppliers={[]}
          products={[]}
        />
      </>
    );
  }

  const [products, suppliers, branches] = await Promise.all([listPurchasableProductsForPicker(), listAllSuppliers(), listBranches()]);
  return (
    <>
      <PageHeader title="Receive Stock — Direct GRN" subtitle="Record stock that arrived without a purchase order." />
      <GRNBuilder mode="direct" poId={null} initialLines={[]} suppliers={suppliers} products={products} branches={branches} />
    </>
  );
}
