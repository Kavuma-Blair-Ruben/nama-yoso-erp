/**
 * One-time migration: read the seed JSON blob embedded in ../index.html and
 * populate the normalized Postgres schema (src/server/db/schema.ts).
 *
 * Usage:
 *   npm run migrate:seed -- --dry-run   (writes reports only, no DB writes)
 *   npm run migrate:seed -- --apply     (writes to the DB)
 *   npm run migrate:seed -- --apply --reset   (truncates migrated tables first)
 *
 * Not part of the running app — run manually, once, from a terminal.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../src/server/db/schema";
import {
  branches,
  suppliers,
  categories,
  subcategories,
  costCenters,
  storageAreas,
  taxRates,
  unitsOfMeasure,
  stockItems,
  mainRecipes,
  subRecipes,
  recipeIngredients,
  invoicesHistorical,
  purchaseLinesHistorical,
  dailySalesHistorical,
  roles,
  rolePermissions,
  profiles,
  PERMISSION_SECTION_KEYS,
  type PermissionLevel,
} from "../src/server/db/schema";
import { eq, sql as dsql } from "drizzle-orm";

// The source spreadsheet leaks Excel error values (e.g. "#N/A") into numeric
// fields for a small number of rows (67 products' rate/rkl/rgm, 19 recipe
// ingredient r0/a0). Postgres numeric columns reject those outright, so every
// raw numeric value gets funneled through this before hitting an insert.
function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RESET = args.includes("--reset");
if (!APPLY && !args.includes("--dry-run")) {
  console.error("Pass --dry-run or --apply.");
  process.exit(1);
}

const REPORT_DIR = path.resolve(__dirname, "migration-report");
mkdirSync(REPORT_DIR, { recursive: true });

/* ============================================================
   1. Extract & parse the seed JSON blob from index.html
   ============================================================ */
type RawProduct = {
  c: string; cat?: string; sub?: string; st?: string; n: string;
  pu?: string; iu?: string; sup?: string; uw?: number; y?: number; nr?: number;
  rate?: number; rkl?: number; rgm?: number;
};
type RawIngredient = { pc: string; n?: string; u?: string; q: number; r0?: number; a0?: number; iw?: number; lp?: number };
type RawRecipe = { code: string; name: string; section?: string; yieldQty?: number | null; yieldUnit?: string | null; ingredients: RawIngredient[] };
type RawInvoice = { d?: string; sup?: string; inv?: string; net?: number; vat?: number; tot?: number; terms?: string; wk?: string; st?: string };
type RawPurchaseLine = { d?: string; sup?: string; inv?: string; item?: string; u?: string; q?: number; r?: number; a?: number; sec?: string; cat?: string };
type RawDailySale = { d: string; s: number };

type RawData = {
  products: RawProduct[];
  mainRecipes: RawRecipe[];
  subRecipes: RawRecipe[];
  invoices?: RawInvoice[];
  purchaseLines?: RawPurchaseLine[];
  dailySales?: RawDailySale[];
};

function loadRawData(): RawData {
  const htmlPath = path.resolve(__dirname, "../../index.html");
  const html = readFileSync(htmlPath, "utf8");
  const openTag = '<script id="erp-data" type="application/json">';
  const start = html.indexOf(openTag);
  if (start === -1) throw new Error(`Could not find ${openTag} in ${htmlPath}`);
  const jsonStart = start + openTag.length;
  const end = html.indexOf("</script>", jsonStart);
  if (end === -1) throw new Error("Could not find closing </script> for erp-data blob");
  const json = html.slice(jsonStart, end);
  return JSON.parse(json) as RawData;
}

/* ============================================================
   2. Normalization helpers
   ============================================================ */
function normalizeKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}
function canonicalDisplay(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

const CORP_SUFFIXES = new Set([
  "LLC", "L.L.C", "TRADING", "CO", "COMPANY", "EST", "ESTABLISHMENT",
  "FZE", "FZCO", "LTD", "LIMITED", "GENERAL", "INTERNATIONAL", "GROUP", "AND",
]);
function fingerprint(raw: string): Set<string> {
  return new Set(
    normalizeKey(raw)
      .split(/[^A-Z0-9]+/)
      .filter((w) => w.length >= 4 && !CORP_SUFFIXES.has(w))
  );
}

const STORAGE_TYPE_MAP: Record<string, "DRY" | "CHILLED" | "FROZEN"> = {
  "🌡️ DRY": "DRY",
  "🔵 CHILLED": "CHILLED",
  "❄️ FROZEN": "FROZEN",
};

/* ============================================================
   3. Build normalized lookup sets from the raw data
   ============================================================ */
function buildSupplierIndex(raw: RawData) {
  const rawNames: string[] = [];
  raw.products.forEach((p) => p.sup && rawNames.push(p.sup));
  (raw.invoices ?? []).forEach((i) => i.sup && rawNames.push(i.sup));
  (raw.purchaseLines ?? []).forEach((l) => l.sup && rawNames.push(l.sup));

  const byKey = new Map<string, { canonical: string; count: number }>();
  for (const name of rawNames) {
    const key = normalizeKey(name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) existing.count++;
    else byKey.set(key, { canonical: canonicalDisplay(name), count: 1 });
  }

  // Flag possible near-duplicates for manual review (shared significant words,
  // but NOT already an exact match) — never auto-merged, report only.
  const keys = [...byKey.keys()];
  const possibleDupes: { a: string; b: string; sharedWords: string[] }[] = [];
  const fps = keys.map((k) => ({ key: k, fp: fingerprint(byKey.get(k)!.canonical) }));
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      const shared = [...fps[i].fp].filter((w) => fps[j].fp.has(w));
      if (shared.length >= 2) {
        possibleDupes.push({ a: byKey.get(fps[i].key)!.canonical, b: byKey.get(fps[j].key)!.canonical, sharedWords: shared });
      }
    }
  }

  return { byKey, possibleDupes };
}

function buildCategoryIndex(raw: RawData) {
  const categoryNames = new Set<string>();
  const subToParent = new Map<string, Map<string, number>>(); // sub -> (category -> count)
  raw.products.forEach((p) => {
    if (p.cat) categoryNames.add(canonicalDisplay(p.cat));
    if (p.sub) {
      const m = subToParent.get(p.sub) ?? new Map<string, number>();
      if (p.cat) m.set(p.cat, (m.get(p.cat) ?? 0) + 1);
      subToParent.set(p.sub, m);
    }
  });
  const subParent = new Map<string, string>(); // sub -> best-guess parent category
  const subAmbiguous: { sub: string; candidates: string[] }[] = [];
  for (const [sub, counts] of subToParent) {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 1) subAmbiguous.push({ sub, candidates: sorted.map(([c]) => c) });
    if (sorted[0]) subParent.set(sub, sorted[0][0]);
  }
  return { categoryNames, subParent, subAmbiguous };
}

/* ============================================================
   4. Main
   ============================================================ */
async function main() {
  const raw = loadRawData();
  console.log(
    `Loaded seed data: ${raw.products.length} products, ${raw.mainRecipes.length} main recipes, ` +
      `${raw.subRecipes.length} sub recipes, ${(raw.invoices ?? []).length} invoices, ` +
      `${(raw.purchaseLines ?? []).length} purchase lines, ${(raw.dailySales ?? []).length} daily sales.`
  );

  const supplierIndex = buildSupplierIndex(raw);
  const categoryIndex = buildCategoryIndex(raw);

  // Storage type report
  const storageTypeCounts = new Map<string, number>();
  raw.products.forEach((p) => {
    const key = p.st ?? "(blank)";
    storageTypeCounts.set(key, (storageTypeCounts.get(key) ?? 0) + 1);
  });

  writeFileSync(
    path.join(REPORT_DIR, "suppliers-review.csv"),
    "supplier_a,supplier_b,shared_words\n" +
      supplierIndex.possibleDupes.map((d) => `"${d.a}","${d.b}","${d.sharedWords.join(" ")}"`).join("\n")
  );
  writeFileSync(
    path.join(REPORT_DIR, "storage-types.csv"),
    "raw_value,count,mapped_to\n" +
      [...storageTypeCounts.entries()]
        .map(([k, v]) => `"${k}",${v},${STORAGE_TYPE_MAP[k] ?? "NULL"}`)
        .join("\n")
  );
  writeFileSync(
    path.join(REPORT_DIR, "subcategory-parents.csv"),
    "subcategory,ambiguous_parent_candidates\n" +
      categoryIndex.subAmbiguous.map((s) => `"${s.sub}","${s.candidates.join(" | ")}"`).join("\n")
  );

  console.log(`\nSuppliers: ${supplierIndex.byKey.size} distinct (after exact-match normalization).`);
  console.log(`  -> ${supplierIndex.possibleDupes.length} possible-duplicate pair(s) flagged in suppliers-review.csv`);
  console.log(`Categories: ${categoryIndex.categoryNames.size} distinct.`);
  console.log(`  -> ${categoryIndex.subAmbiguous.length} subcategory(ies) with ambiguous parent, see subcategory-parents.csv`);
  console.log(`Storage types: see storage-types.csv (only DRY/CHILLED/FROZEN map cleanly).`);

  const subCodes = new Set(raw.subRecipes.map((r) => r.code));
  const purchasedCount = raw.products.filter((p) => !subCodes.has(p.c)).length;
  const producedCount = raw.subRecipes.length;
  console.log(`\nstock_items split: ${purchasedCount} purchased + ${producedCount} produced = ${purchasedCount + producedCount} total.`);

  if (!APPLY) {
    console.log("\n--dry-run only: no database writes performed. Review the reports in scripts/migration-report/, then re-run with --apply.");
    return;
  }

  if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) throw new Error("DATABASE_URL / DIRECT_URL not set.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set.");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set.");
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD not set.");

  // Use the direct connection for DDL-adjacent bulk work (truncate + large inserts).
  const client = postgres(process.env.DIRECT_URL, { prepare: false, max: 1, ssl: "require" });
  const db = drizzle(client, { schema });

  if (RESET) {
    console.log("\n--reset: truncating migrated tables...");
    await db.execute(dsql`
      truncate table
        grn_lines, grns, purchase_order_lines, purchase_orders, price_history,
        recipe_ingredients, sub_recipes, main_recipes, product_supplier_packaging, stock_items,
        purchase_lines_historical, invoices_historical, daily_sales_historical,
        role_permissions, profiles, audit_log, roles,
        subcategories, categories, suppliers, units_of_measure, tax_rates, storage_areas, cost_centers, branches
      restart identity cascade
    `);
  } else {
    const existing = await db.select({ id: stockItems.id }).from(stockItems).limit(1);
    if (existing.length > 0) {
      throw new Error("stock_items is not empty. Re-run with --reset to truncate migrated tables first, or this is a duplicate run.");
    }
  }

  console.log("\nInserting lookups...");
  const insertedBranches = await db
    .insert(branches)
    .values([
      { code: "NAMAYOSO", name: "NAMAYOSO" },
      { code: "THG", name: "THG" },
    ])
    .returning({ id: branches.id });
  // Cost centers are branch-scoped — each branch gets its own independent
  // Kitchen/Bar/General/Central Warehouse (see migrate-cost-centers-branch-scope.ts
  // for the migration that later applied this same shape to a live DB).
  await db.insert(costCenters).values(
    insertedBranches.flatMap((b) => ["Kitchen", "Bar", "General", "Central Warehouse"].map((name) => ({ branchId: b.id, name })))
  );
  await db.insert(storageAreas).values(
    ["Dry Store", "Walk-in Chiller", "Walk-in Freezer", "Bar Store"].map((name) => ({ name }))
  );
  await db.insert(taxRates).values([
    { name: "Standard VAT", pct: 5 },
    { name: "Zero-Rated", pct: 0 },
  ]);
  await db.insert(unitsOfMeasure).values([
    { code: "u_g", name: "Gram (g)", type: "weight", factor: 1 },
    { code: "u_kg", name: "Kilogram (kg)", type: "weight", factor: 1000 },
    { code: "u_ml", name: "Millilitre (ml)", type: "volume", factor: 1 },
    { code: "u_l", name: "Litre (l)", type: "volume", factor: 1000 },
    { code: "u_pc", name: "Piece (pc)", type: "count", factor: 1 },
  ]);

  const supplierIdByKey = new Map<string, string>();
  {
    const rows = [...supplierIndex.byKey.entries()].map(([key, v]) => ({ key, name: v.canonical }));
    const inserted = await db.insert(suppliers).values(rows.map((r) => ({ name: r.name }))).returning({ id: suppliers.id, name: suppliers.name });
    const idByName = new Map(inserted.map((r) => [r.name, r.id]));
    for (const r of rows) supplierIdByKey.set(r.key, idByName.get(r.name)!);
  }

  const categoryIdByName = new Map<string, string>();
  {
    const names = [...categoryIndex.categoryNames];
    const inserted = await db.insert(categories).values(names.map((name, i) => ({ name, sortOrder: i }))).returning({ id: categories.id, name: categories.name });
    inserted.forEach((r) => categoryIdByName.set(r.name, r.id));
  }

  const subcategoryIdByName = new Map<string, string>();
  {
    const rows = [...categoryIndex.subParent.entries()]
      .filter(([, parent]) => categoryIdByName.has(canonicalDisplay(parent)))
      .map(([sub, parent]) => ({ name: sub, categoryId: categoryIdByName.get(canonicalDisplay(parent))! }));
    if (rows.length) {
      const inserted = await db.insert(subcategories).values(rows).returning({ id: subcategories.id, name: subcategories.name });
      inserted.forEach((r) => subcategoryIdByName.set(r.name, r.id));
    }
  }

  console.log("Inserting stock_items...");
  const missingIngredients: string[] = [];
  const stockItemIdByLegacyCode = new Map<string, string>();
  {
    const purchasedRows = raw.products
      .filter((p) => !subCodes.has(p.c))
      .map((p) => ({
        legacyCode: p.c,
        sourceType: "purchased" as const,
        name: p.n,
        categoryId: p.cat ? categoryIdByName.get(canonicalDisplay(p.cat)) : undefined,
        subcategoryId: p.sub ? subcategoryIdByName.get(p.sub) : undefined,
        storageType: p.st ? STORAGE_TYPE_MAP[p.st] : undefined,
        storageTypeRaw: p.st,
        supplierId: p.sup ? supplierIdByKey.get(normalizeKey(p.sup)) : undefined,
        purchaseUnit: p.pu,
        issueUnit: p.iu,
        unitWeight: num(p.uw),
        yieldPct: num(p.y) ?? 1,
        netRecoveredQty: num(p.nr),
        purchaseRate: num(p.rate),
        ratePerKgL: num(p.rkl),
        ratePerGMl: num(p.rgm),
      }));
    if (purchasedRows.length) {
      const inserted = await db.insert(stockItems).values(purchasedRows).returning({ id: stockItems.id, legacyCode: stockItems.legacyCode });
      inserted.forEach((r) => stockItemIdByLegacyCode.set(r.legacyCode, r.id));
    }

    const productByCode = new Map(raw.products.map((p) => [p.c, p]));
    const producedRows = raw.subRecipes.map((r) => {
      const p = productByCode.get(r.code);
      return {
        legacyCode: r.code,
        sourceType: "produced" as const,
        name: p?.n ?? r.name,
        categoryId: p?.cat ? categoryIdByName.get(canonicalDisplay(p.cat)) : undefined,
        subcategoryId: p?.sub ? subcategoryIdByName.get(p.sub) : undefined,
        storageType: p?.st ? STORAGE_TYPE_MAP[p.st] : undefined,
        storageTypeRaw: p?.st,
        supplierId: undefined,
        purchaseUnit: p?.pu,
        issueUnit: p?.iu,
        unitWeight: num(p?.uw),
        yieldPct: num(p?.y) ?? 1,
        netRecoveredQty: num(p?.nr),
        purchaseRate: num(p?.rate),
        ratePerKgL: num(p?.rkl),
        ratePerGMl: num(p?.rgm),
      };
    });
    if (producedRows.length) {
      const inserted = await db.insert(stockItems).values(producedRows).returning({ id: stockItems.id, legacyCode: stockItems.legacyCode });
      inserted.forEach((r) => stockItemIdByLegacyCode.set(r.legacyCode, r.id));
    }
  }

  // Placeholder for ingredients that reference a code with no matching stock item.
  const [placeholder] = await db
    .insert(stockItems)
    .values({
      legacyCode: "__MISSING_INGREDIENT_PLACEHOLDER__",
      sourceType: "purchased",
      name: "(unresolved ingredient — see missing-ingredients.csv)",
      isActive: false,
    })
    .returning({ id: stockItems.id });

  function resolveStockItemId(code: string): string {
    const id = stockItemIdByLegacyCode.get(code);
    if (id) return id;
    missingIngredients.push(code);
    return placeholder.id;
  }

  console.log("Inserting recipes...");
  const mainRecipeIdByCode = new Map<string, string>();
  {
    const rows = raw.mainRecipes.map((r) => ({
      legacyCode: r.code,
      name: r.name,
      section: r.section,
      yieldQty: num(r.yieldQty),
      yieldUnit: r.yieldUnit ?? undefined,
    }));
    if (rows.length) {
      const inserted = await db.insert(mainRecipes).values(rows).returning({ id: mainRecipes.id, legacyCode: mainRecipes.legacyCode });
      inserted.forEach((r) => mainRecipeIdByCode.set(r.legacyCode, r.id));
    }
  }
  const subRecipeIdByCode = new Map<string, string>();
  {
    const rows = raw.subRecipes
      .filter((r) => stockItemIdByLegacyCode.has(r.code))
      .map((r) => ({
        legacyCode: r.code,
        stockItemId: stockItemIdByLegacyCode.get(r.code)!,
        name: r.name,
        section: r.section,
        yieldQty: num(r.yieldQty),
        yieldUnit: r.yieldUnit ?? undefined,
      }));
    if (rows.length) {
      const inserted = await db.insert(subRecipes).values(rows).returning({ id: subRecipes.id, legacyCode: subRecipes.legacyCode });
      inserted.forEach((r) => subRecipeIdByCode.set(r.legacyCode, r.id));
    }
  }

  console.log("Inserting recipe ingredients...");
  {
    const ingredientRows: (typeof recipeIngredients.$inferInsert)[] = [];
    raw.mainRecipes.forEach((r) => {
      const mainRecipeId = mainRecipeIdByCode.get(r.code);
      if (!mainRecipeId) return;
      r.ingredients.forEach((ing, i) => {
        ingredientRows.push({
          mainRecipeId,
          subRecipeId: undefined,
          stockItemId: resolveStockItemId(ing.pc),
          lineNo: i,
          unitLabel: ing.u,
          qty: num(ing.q) ?? 0,
          rateAtBuild: num(ing.r0),
          amountAtBuild: num(ing.a0),
          ingredientWeightG: num(ing.iw),
          lastPrice: num(ing.lp),
        });
      });
    });
    raw.subRecipes.forEach((r) => {
      const subRecipeId = subRecipeIdByCode.get(r.code);
      if (!subRecipeId) return;
      r.ingredients.forEach((ing, i) => {
        ingredientRows.push({
          mainRecipeId: undefined,
          subRecipeId,
          stockItemId: resolveStockItemId(ing.pc),
          lineNo: i,
          unitLabel: ing.u,
          qty: num(ing.q) ?? 0,
          rateAtBuild: num(ing.r0),
          amountAtBuild: num(ing.a0),
          ingredientWeightG: num(ing.iw),
          lastPrice: num(ing.lp),
        });
      });
    });
    for (let i = 0; i < ingredientRows.length; i += 500) {
      await db.insert(recipeIngredients).values(ingredientRows.slice(i, i + 500));
    }
  }
  writeFileSync(path.join(REPORT_DIR, "missing-ingredients.csv"), "legacy_code\n" + [...new Set(missingIngredients)].join("\n"));

  console.log("Inserting historical ledger (invoices, purchase lines, daily sales)...");
  const invoiceIdByKey = new Map<string, string>(); // `${date}|${supplierKey}|${inv}` -> id
  {
    const rows = (raw.invoices ?? []).map((inv) => {
      const termsNormalized = ["cash", "credit", "paid", "petty cash"].includes((inv.terms ?? "").toLowerCase())
        ? inv.terms!.toLowerCase()
        : undefined;
      return {
        invoiceDate: inv.d,
        supplierId: inv.sup ? supplierIdByKey.get(normalizeKey(inv.sup)) : undefined,
        invoiceNumber: inv.inv,
        net: num(inv.net),
        vat: num(inv.vat),
        total: num(inv.tot),
        terms: inv.terms,
        termsNormalized,
        weekLabel: inv.wk,
        status: inv.st === "OUTSTANDING" || inv.st === "PAID" ? inv.st : "OTHER",
        _key: inv.d && inv.sup && inv.inv ? `${inv.d}|${normalizeKey(inv.sup)}|${inv.inv}` : undefined,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const inserted = await db
        .insert(invoicesHistorical)
        .values(batch.map(({ _key, ...r }) => r))
        .returning({ id: invoicesHistorical.id, invoiceDate: invoicesHistorical.invoiceDate, supplierId: invoicesHistorical.supplierId, invoiceNumber: invoicesHistorical.invoiceNumber });
      batch.forEach((r, j) => {
        if (r._key) invoiceIdByKey.set(r._key, inserted[j].id);
      });
    }
  }
  {
    let unmatched = 0;
    const rows = (raw.purchaseLines ?? []).map((l) => {
      const key = l.d && l.sup && l.inv ? `${l.d}|${normalizeKey(l.sup)}|${l.inv}` : undefined;
      const invoiceId = key ? invoiceIdByKey.get(key) : undefined;
      if (!invoiceId) unmatched++;
      return {
        invoiceId,
        purchaseDate: l.d,
        supplierId: l.sup ? supplierIdByKey.get(normalizeKey(l.sup)) : undefined,
        itemLabel: l.item,
        unitLabel: l.u,
        qty: num(l.q),
        rate: num(l.r),
        amount: num(l.a),
        section: l.sec,
        category: l.cat,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(purchaseLinesHistorical).values(rows.slice(i, i + 500));
    }
    console.log(`  purchase_lines_historical: ${rows.length} inserted, ${unmatched} without a matching invoice (invoice_id = null).`);
  }
  {
    const rows = (raw.dailySales ?? []).map((s) => ({ salesDate: s.d, amount: num(s.s) ?? 0 }));
    if (rows.length) await db.insert(dailySalesHistorical).values(rows);
  }

  console.log("Seeding roles + role_permissions...");
  function permMatrixAll(level: PermissionLevel) {
    return Object.fromEntries(PERMISSION_SECTION_KEYS.map((k) => [k, level]));
  }
  function permMatrixOverride(base: PermissionLevel, overrides: Partial<Record<(typeof PERMISSION_SECTION_KEYS)[number], PermissionLevel>>) {
    return { ...permMatrixAll(base), ...overrides };
  }
  const roleSeeds: { key: string; name: string; permissions: Record<string, PermissionLevel> }[] = [
    { key: "role_owner", name: "Owner / Admin", permissions: permMatrixAll("edit") },
    { key: "role_manager", name: "Branch Manager", permissions: permMatrixOverride("edit", { system: "view", permissions: "none" }) },
    {
      key: "role_purchasing",
      name: "Purchasing",
      permissions: permMatrixOverride("none", { suppliers: "edit", orders: "edit", grn: "edit", items: "view", reports: "view", branchsettings: "view" }),
    },
    {
      key: "role_kitchen",
      name: "Kitchen Staff",
      permissions: permMatrixOverride("none", { wastage: "edit", stockcount: "edit", subrecipes: "edit", items: "view", recipes: "view", orders: "view" }),
    },
    { key: "role_readonly", name: "Read Only", permissions: permMatrixOverride("view", { permissions: "none" }) },
  ];
  const roleIdByKey = new Map<string, string>();
  for (const r of roleSeeds) {
    const [inserted] = await db.insert(roles).values({ key: r.key, name: r.name, isSystem: true }).returning({ id: roles.id });
    roleIdByKey.set(r.key, inserted.id);
    await db.insert(rolePermissions).values(
      Object.entries(r.permissions).map(([sectionKey, level]) => ({ roleId: inserted.id, sectionKey, level }))
    );
  }

  console.log("Creating bootstrap admin user...");
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (authError || !authUser.user) throw new Error(`Failed to create bootstrap admin: ${authError?.message}`);
  await db.insert(profiles).values({
    id: authUser.user.id,
    name: "Owner / Admin",
    email: process.env.ADMIN_EMAIL,
    roleId: roleIdByKey.get("role_owner")!,
    branches: ["NAMAYOSO", "THG"],
    active: true,
  });

  const summary = [
    `stock_items: ${purchasedCount} purchased + ${producedCount} produced`,
    `main_recipes: ${raw.mainRecipes.length}`,
    `sub_recipes: ${raw.subRecipes.length}`,
    `recipe ingredients missing a stock item match: ${new Set(missingIngredients).size} distinct code(s) — see missing-ingredients.csv`,
    `invoices_historical: ${(raw.invoices ?? []).length}`,
    `purchase_lines_historical: ${(raw.purchaseLines ?? []).length}`,
    `daily_sales_historical: ${(raw.dailySales ?? []).length}`,
    `suppliers: ${supplierIndex.byKey.size}`,
    `bootstrap admin: ${process.env.ADMIN_EMAIL}`,
  ].join("\n");
  writeFileSync(path.join(REPORT_DIR, "summary.txt"), summary);
  console.log("\n" + summary);
  console.log("\nDone.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
