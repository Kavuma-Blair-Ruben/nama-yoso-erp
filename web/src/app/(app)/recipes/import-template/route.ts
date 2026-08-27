import { NextResponse } from "next/server";
import { requireSection } from "@/server/auth/permissions";
import { toCsv } from "@/lib/csv";

export async function GET() {
  await requireSection("recipes", "edit");

  const headers = ["Recipe Code", "Type (Main/Sub)", "Recipe Name", "Section", "Yield Qty", "Yield Unit", "Selling Price", "Ingredient Code", "Ingredient Name", "Qty Needed", "Wastage %", "Unit", "Branches"];
  // One example recipe spanning 3 rows — repeat the header fields
  // (Recipe Code/Type/Name/Section/Yield/Selling Price) on every ingredient
  // row for that recipe; only the ingredient columns change row to row.
  // Recipe Code is optional — leave blank to auto-assign a new one.
  const example: (string | number)[][] = [
    ["MR050", "Main", "Grilled Chicken Salad", "Mains", 1, "portion", 45, "1023", "", 0.15, 5, "kg", ""],
    ["MR050", "Main", "Grilled Chicken Salad", "Mains", 1, "portion", 45, "", "Lettuce", 0.08, 3, "kg", ""],
    ["MR050", "Main", "Grilled Chicken Salad", "Mains", 1, "portion", 45, "2044", "", 0.02, 0, "L", ""],
  ];

  const csv = toCsv(headers, example);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recipes-import-template.csv"`,
    },
  });
}
