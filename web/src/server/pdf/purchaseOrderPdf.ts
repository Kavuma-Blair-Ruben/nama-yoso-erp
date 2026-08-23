import "server-only";
import { getPurchaseOrderDetail } from "@/server/db/queries/purchaseOrders";
import { renderPdfBuffer } from "@/lib/pdf/render";
import { PurchaseOrderPdf } from "@/lib/pdf/PurchaseOrderPdf";

export async function buildPoPdfBuffer(id: string) {
  const data = await getPurchaseOrderDetail(id);
  if (!data) throw new Error("Purchase order not found.");
  const { po, lines, net, vat, total } = data;
  const buffer = await renderPdfBuffer(
    PurchaseOrderPdf({
      po: {
        poNumber: po.poNumber,
        createdDate: po.createdDate,
        status: po.status,
        supplierName: po.supplier,
        supplierContactName: po.supplierContactName,
        supplierPhone: po.supplierPhone,
        supplierEmail: po.supplierEmail,
        supplierTrn: po.supplierTrn,
        supplierPaymentTerms: po.supplierPaymentTerms,
        deliverToLabel: po.branchName ?? po.deliverTo ?? "-",
        notes: po.notes,
        lines: lines.map((l) => ({ name: l.name, qty: l.qty, unitLabel: l.unitLabel, rate: l.rate, taxRate: l.taxRate })),
        net,
        vat,
        total,
      },
    })
  );
  return { po, buffer };
}
