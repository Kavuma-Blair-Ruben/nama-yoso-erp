// Pure unit-conversion helpers shared between server costing code and client
// ledger components — no "server-only" guard here on purpose.

export function displayYield(qty: number | null | undefined, unit: string | null | undefined): { qty: number | null | undefined; unit: string | null | undefined } {
  if (qty == null || Number.isNaN(qty)) return { qty, unit };
  const u = (unit ?? "").trim().toUpperCase();
  if (["G", "GM", "GRAM", "GRAMS"].includes(u)) return { qty: qty / 1000, unit: "KG" };
  if (["ML", "MILLILITER", "MILLILITRE"].includes(u)) return { qty: qty / 1000, unit: "L" };
  return { qty, unit };
}

export function normalizeToKgLtr(costPerUnit: number | null, unit: string | null): number | null {
  if (costPerUnit == null || Number.isNaN(costPerUnit)) return null;
  const u = (unit ?? "").trim().toUpperCase();
  if (["G", "GM", "GRAM", "GRAMS"].includes(u)) return costPerUnit * 1000;
  if (["ML", "MILLILITER", "MILLILITRE"].includes(u)) return costPerUnit * 1000;
  if (["KG", "KGS", "KILOGRAM"].includes(u)) return costPerUnit;
  if (["L", "LTR", "LITER", "LITRE"].includes(u)) return costPerUnit;
  return null;
}

type UnitCategory = "weight" | "volume" | "count";

export function categorizeUnit(unit: string | null | undefined): UnitCategory {
  const u = (unit ?? "").trim().toUpperCase();
  if (["G", "GM", "GRAM", "GRAMS", "KG", "KGS", "KILOGRAM"].includes(u)) return "weight";
  if (["ML", "MILLILITER", "MILLILITRE", "L", "LTR", "LITER", "LITRE"].includes(u)) return "volume";
  return "count";
}

// ratePerKgL is a misnomer for a count-purchased item (issueUnit "pc"/"all"
// etc.) — it's really just "live rate per issue unit" there, no gram/ml
// conversion applies. Only a genuine weight/volume issueUnit needs the
// ×1000 scale-up (unitWeight is stored in grams/ml for those, so dividing
// by it first gives a per-gram/per-ml rate that then needs ×1000 to reach
// per-kg/per-litre). Applying ×1000 unconditionally would silently inflate
// a count item's live rate 1000x the moment it was ever re-saved.
export function computeRatePerKgL(rate: number, unitWeight: number | null | undefined, issueUnit: string | null | undefined): number {
  const perIssueUnit = unitWeight ? rate / unitWeight : rate;
  return categorizeUnit(issueUnit) === "count" ? perIssueUnit : perIssueUnit * 1000;
}

/**
 * Converts a raw quantity in a given unit into the canonical KG/LTR-or-piece
 * basis used by recipe costing (recipe_ingredients.qty) and the stock ledger
 * (stock_movements/stock_balances). Opposite arithmetic direction from
 * normalizeToKgLtr: that one converts a *cost per unit* (smaller unit costs
 * less, so it scales UP to reach a per-kg rate); this converts a *quantity*
 * (500g is a smaller number of kilos, so it scales DOWN).
 */
export function convertQtyToCanonical(qty: number, unit: string | null | undefined): number {
  const u = (unit ?? "").trim().toUpperCase();
  if (["G", "GM", "GRAM", "GRAMS", "ML", "MILLILITER", "MILLILITRE"].includes(u)) return qty / 1000;
  return qty;
}

/**
 * Inverse of convertQtyToCanonical + the GRN-receiving unitWeight scale
 * (qtyInIssueUnit = purchaseQty * unitWeight; canonicalQty =
 * convertQtyToCanonical(qtyInIssueUnit, issueUnit)) — used by "Fill Cart to
 * Par" to turn a canonical-basis shortfall (par level - on hand, both
 * canonical) back into a purchase-order-unit quantity to add to the cart.
 */
export function canonicalToPurchaseQty(canonicalQty: number, issueUnit: string | null | undefined, unitWeight: number | null | undefined): number {
  const u = (issueUnit ?? "").trim().toUpperCase();
  const issueUnitQty = ["G", "GM", "GRAM", "GRAMS", "ML", "MILLILITER", "MILLILITRE"].includes(u) ? canonicalQty * 1000 : canonicalQty;
  return issueUnitQty / (unitWeight || 1);
}

/**
 * Ported from index.html's ledgerDisplayUnit(). Recipe ingredient quantities
 * are always stored KG/LTR-equivalent for weight/volume items, but the raw
 * unitLabel on a recipe_ingredients row is often a stale purchase-pack label
 * ("PKT-500G", "TUB-1.65KG") carried over from whatever packaging was picked
 * when the line was built — it doesn't match the KG/LTR scale actually shown.
 * Derive the label from the ingredient's *current* type (the linked product's
 * issue unit, or the sub-recipe's yield unit) instead of trusting that stored
 * text, so Qty and Unit always agree with each other.
 */
/**
 * The display label for a canonical-basis quantity of a plain stock item —
 * same weight/volume normalization as ledgerDisplayUnit's non-sub branch,
 * exposed standalone for builders (Wastage, Transfers, new Recipe lines)
 * that pick straight from the product list rather than an existing
 * recipe_ingredients row. Using the item's raw issueUnit ("gm") as the label
 * here would mislabel a canonical qty of 2 (i.e. 2 KG) as "2 gm".
 */
export function canonicalUnitLabel(issueUnit: string | null | undefined): string {
  const cat = categorizeUnit(issueUnit);
  if (cat === "count") return issueUnit || "PC";
  return cat === "volume" ? "L" : "KG";
}

/**
 * Converts an already-canonical (KG/L/piece) qty+unit pair — e.g. straight
 * out of ledgerDisplayUnit — into a grams/millilitres basis for the printed
 * Cook Book, where a chef reading "40 g" off a card is far more usable than
 * "0.040 KG". Count-based ingredients (pieces) are left untouched.
 */
export function gramsDisplay(qty: number, unit: string): { qty: number; unit: string } {
  const u = unit.trim().toUpperCase();
  if (u === "KG") return { qty: qty * 1000, unit: "G" };
  if (u === "L") return { qty: qty * 1000, unit: "ML" };
  return { qty, unit };
}

/**
 * A sub-recipe's production yield %: how much of the raw ingredient
 * weight/volume that went in came out as usable finished batch (e.g. 5kg of
 * chicken in, 4kg of trimmed/cooked yield out = 80%). Only meaningful when
 * the batch yield unit is weight or volume — a piece-count yield has no
 * comparable "raw input" total, so that case returns null. Weight and volume
 * lines are combined into one input total treating 1 L as 1 KG (the same
 * water-based approximation used everywhere else in this app that mixes the
 * two without a per-item density) — comparing only same-category lines would
 * ignore liquid ingredients that also add mass, inflating a sauce's % well
 * above 100 and making a perfectly normal recipe look broken. Piece-based
 * ingredient lines (can't convert to mass) are excluded from the total.
 * `lines[].qty` must already be canonical (KG/L/piece), same basis as
 * recipe_ingredients.qty.
 */
export function computeYieldPct(
  yieldQty: number | null | undefined,
  yieldUnit: string | null | undefined,
  lines: { qty: number; unit: string | null | undefined }[]
): number | null {
  if (yieldQty == null || !yieldQty) return null;
  const cat = categorizeUnit(yieldUnit);
  if (cat === "count") return null;
  const dy = displayYield(yieldQty, yieldUnit);
  if (dy.qty == null) return null;
  const inputQty = lines.filter((l) => categorizeUnit(l.unit) !== "count").reduce((sum, l) => sum + l.qty, 0);
  if (!inputQty) return null;
  return (dy.qty / inputQty) * 100;
}

export function ledgerDisplayUnit(args: {
  isSub: boolean;
  ingredientUnitLabel: string | null | undefined;
  productIssueUnit?: string | null;
  subYieldUnit?: string | null;
}): string {
  if (args.isSub) {
    const cat = categorizeUnit(args.subYieldUnit);
    if (cat === "count") return args.subYieldUnit || args.ingredientUnitLabel || "PC";
    return cat === "volume" ? "L" : "KG";
  }
  const cat = categorizeUnit(args.productIssueUnit);
  if (cat === "count") return args.ingredientUnitLabel || args.productIssueUnit || "PC";
  return cat === "volume" ? "L" : "KG";
}
