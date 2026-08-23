import { NextResponse } from "next/server";
import { requireSection } from "@/server/auth/permissions";
import { buildPoPdfBuffer } from "@/server/pdf/purchaseOrderPdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSection("orders", "view");
  const { id } = await params;
  const { po, buffer } = await buildPoPdfBuffer(id);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${po.poNumber}.pdf"`,
    },
  });
}
