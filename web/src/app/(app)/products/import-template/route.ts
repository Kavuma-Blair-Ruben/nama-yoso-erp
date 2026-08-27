import { NextResponse } from "next/server";
import { requireSection } from "@/server/auth/permissions";
import { toCsv } from "@/lib/csv";

export async function GET() {
  await requireSection("items", "edit");

  const headers = ["Code", "Name", "Category", "Subcategory", "Supplier", "Storage Type", "Purchase Unit", "Issue Unit", "Unit Weight", "Purchase Rate", "Branches", "Min Level", "Par Level"];
  const example = ["2000", "Tomato", "Vegetables", "Fresh Produce", "Fresh Farms LLC", "CHILLED", "KG", "gm", 1, 12.5, "", 5, 20];

  const csv = toCsv(headers, [example]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-import-template.csv"`,
    },
  });
}
