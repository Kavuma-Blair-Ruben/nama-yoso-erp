import { NextResponse } from "next/server";
import { requireSection } from "@/server/auth/permissions";
import { toCsv } from "@/lib/csv";

export async function GET() {
  await requireSection("suppliers", "edit");

  const headers = ["Name", "TRN", "Contact Name", "Phone", "Email", "Payment Terms", "Lead Time Days", "Notes", "Order Limit Amount", "Order Limit Frequency", "Receiving Limit Amount", "Receiving Limit Frequency"];
  const example = ["Fresh Farms LLC", "100123456700003", "Ali Hassan", "+971501234567", "ali@freshfarms.com", "Net 30", 3, "", "", "", "", ""];

  const csv = toCsv(headers, [example]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suppliers-import-template.csv"`,
    },
  });
}
