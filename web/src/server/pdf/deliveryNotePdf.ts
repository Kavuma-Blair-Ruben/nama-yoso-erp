import "server-only";
import { getDeliveryNoteDetail } from "@/server/db/queries/ckSales";
import { renderPdfBuffer } from "@/lib/pdf/render";
import { DeliveryNotePdf } from "@/lib/pdf/DeliveryNotePdf";

export async function buildDnPdfBuffer(id: string) {
  const data = await getDeliveryNoteDetail(id);
  if (!data) throw new Error("Delivery note not found.");
  const { dn, lines } = data;
  const buffer = await renderPdfBuffer(
    DeliveryNotePdf({
      dn: {
        number: dn.number,
        docType: dn.docType as "DN" | "PRO",
        deliveryDate: dn.deliveryDate,
        customerName: dn.customerName,
        customerEmail: dn.customerEmail,
        customerPhone: dn.customerPhone,
        branchName: dn.branchName,
        lines: lines.map((l) => ({ name: l.name, qty: l.qty, unitLabel: l.unitLabel, price: l.price, amount: l.amount })),
        total: dn.total,
      },
    })
  );
  return { dn, buffer };
}
