import { notFound } from "next/navigation";
import { requireSection } from "@/server/auth/permissions";
import { allowedBranchCodes } from "@/server/auth/branchAccess";
import { PageHeader } from "@/components/ui/PageHeader";
import { GRNBuilder } from "@/components/grn/GRNBuilder";
import { getGrnForEdit } from "@/server/db/queries/grn";
import { listPurchasableProductsForPicker, listAllSuppliers, listBranches } from "@/server/db/queries/purchaseOrders";
import { listAllActiveCostCenters } from "@/server/db/queries/costCenters";
import { getOrCreateCashSupplierId } from "@/server/db/queries/suppliers";
import { withTimeout } from "@/lib/withTimeout";

export default async function EditGrnPage({ params }: PageProps<"/grn/[id]/edit">) {
  const session = await requireSection("grn", "edit");
  const { id } = await params;

  const [data, products, suppliers, branches, costCenters, cashSupplierId] = await withTimeout(Promise.all([
    getGrnForEdit(id),
    listPurchasableProductsForPicker(),
    listAllSuppliers(),
    listBranches(allowedBranchCodes(session)),
    listAllActiveCostCenters(),
    getOrCreateCashSupplierId(),
  ]), 20000, "This is taking longer than expected — please try again in a moment.");
  if (!data) notFound();
  const { grn, lines } = data;
  const mode: "po" | "direct" = grn.purchaseOrderId ? "po" : "direct";
  const supplierName = suppliers.find((s) => s.id === grn.supplierId)?.name;
  const costCenterName = costCenters.find((c) => c.id === grn.costCenterId)?.name;

  const initialLines = lines.map((l) => ({
    stockItemId: l.stockItemId,
    purchaseOrderLineId: l.purchaseOrderLineId,
    name: l.name,
    unitLabel: l.unitLabel ?? "",
    orderedQty: l.orderedQty,
    alreadyReceived: 0,
    receivedQty: l.receivedQty,
    rate: l.rate,
    discountPct: l.discountPct,
    taxRate: l.taxRate,
    isFoc: l.isFoc,
    expiryDate: l.expiryDate ?? "",
    condition: l.condition as "ACCEPTED" | "DAMAGED" | "REJECTED",
    currentRate: l.currentRate,
  }));

  return (
    <>
      <PageHeader title={`Edit Draft — ${grn.grnNumber}`} subtitle="Fix any details before posting. Nothing here has updated stock yet." backHref={`/grn/${id}`} />
      <GRNBuilder
        mode={mode}
        poId={grn.purchaseOrderId}
        supplierName={supplierName}
        supplierId={grn.supplierId}
        branchId={grn.branchId}
        costCenterName={costCenterName}
        initialLines={initialLines}
        suppliers={suppliers}
        products={products}
        branches={branches}
        costCenters={costCenters}
        initialCostCenterId={grn.costCenterId ?? undefined}
        existingGrnId={grn.id}
        initialInvoiceNumber={grn.invoiceNumber ?? ""}
        initialReceivedDate={grn.receivedDate}
        initialInvoiceDueDate={grn.invoiceDueDate ?? ""}
        initialAttachmentUrl={grn.attachmentUrl ?? ""}
        initialDocumentType={grn.documentType === "TAX_INVOICE" || grn.documentType === "DELIVERY_NOTE" ? grn.documentType : ""}
        cashSupplierId={cashSupplierId}
        initialPaymentMethod={grn.paymentMethod === "PETTY_CASH" ? "PETTY_CASH" : "INVOICE"}
        initialVendorNote={grn.vendorNote ?? ""}
      />
    </>
  );
}
