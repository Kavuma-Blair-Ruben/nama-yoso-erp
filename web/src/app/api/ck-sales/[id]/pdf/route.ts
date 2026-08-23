import { NextResponse } from "next/server";
import { requireSection } from "@/server/auth/permissions";
import { buildDnPdfBuffer } from "@/server/pdf/deliveryNotePdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSection("ckwarehouse", "view");
  const { id } = await params;
  const { dn, buffer } = await buildDnPdfBuffer(id);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${dn.number}.pdf"`,
    },
  });
}
