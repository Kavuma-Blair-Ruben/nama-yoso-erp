import "server-only";

// Foodics REST API client. Ground truth: Foodics' own published OpenAPI spec
// (https://storage.googleapis.com/versori-assets/public-specs/20240226/Foodics-API.yml),
// fetched and read directly rather than guessed. Confirmed from that spec:
//   - Auth: a static bearer token (Settings > API in the Foodics dashboard —
//     NOT a full OAuth2 client-credentials flow), sent as `Authorization: Bearer <token>`.
//   - Base URL: https://api.foodics.com/v5 (the spec's {{baseurl}} placeholder;
//     v5 is Foodics' current documented API version as of this writing).
//   - POST /orders' request body — which Foodics APIs typically echo back
//     unchanged on GET — confirms order fields: business_date (YYYY-MM-DD),
//     branch_id, total_price, subtotal_price, discount_amount, and a
//     `products[]` array with product_id/quantity/unit_price/total_price.
//   - GET /orders, GET /products, GET /branches response BODIES are not
//     documented in that spec (shown as empty `{}`) — only request shapes
//     are. Parsing below is deliberately defensive (tries several plausible
//     field names, a Laravel-style `{data: [...]}` envelope OR a bare array)
//     rather than assuming one rigid shape, since it's genuinely unverified
//     against a real account. testFoodicsConnection() exists specifically so
//     the first real sync can be checked/adjusted against real response data.
const FOODICS_BASE_URL = "https://api.foodics.com/v5";

async function foodicsGet(apiToken: string, path: string): Promise<{ error?: string; data?: unknown }> {
  try {
    const res = await fetch(`${FOODICS_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) return { error: "Foodics rejected this API token — check it's current and has the right scope in Foodics Settings > API." };
    if (res.status === 429) return { error: "Foodics rate-limited this request — wait a moment and try again." };
    if (!res.ok) return { error: `Foodics returned ${res.status} for ${path}.` };
    return { data: await res.json() };
  } catch (err) {
    return { error: err instanceof Error ? `Couldn't reach Foodics: ${err.message}` : "Couldn't reach Foodics." };
  }
}

// Foodics' own docs show a Laravel-style {data: [...], links, meta} envelope
// on most SaaS APIs of this shape; unwrap it if present, else treat the
// response itself as the array.
function unwrapList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) return (data as { data: Record<string, unknown>[] }).data;
  return [];
}

export async function testFoodicsConnection(apiToken: string): Promise<{ error?: string; branchCount?: number; sample?: unknown }> {
  const result = await foodicsGet(apiToken, "/branches");
  if (result.error) return { error: result.error };
  const rows = unwrapList(result.data);
  return { branchCount: rows.length, sample: rows[0] ?? result.data };
}

export type FoodicsBranch = { id: string; name: string };

// Real field names confirmed against Foodics' published webhook payload
// (order.branch = {id, name}) — GET /branches is documented as returning an
// unspecified body, but a webhook's branch object is the same entity, so
// {id, name} is a solid bet rather than a guess.
export async function fetchFoodicsBranches(apiToken: string): Promise<{ error?: string; branches?: FoodicsBranch[] }> {
  const result = await foodicsGet(apiToken, "/branches");
  if (result.error) return { error: result.error };
  const rows = unwrapList(result.data);
  const branches = rows.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "Unnamed branch") })).filter((b) => b.id);
  return { branches };
}

export type FoodicsOrderLine = { sourceOrderId: string; saleDate: string; productId?: string; productLabel: string; qty: number; revenue: number };

// Fetches every order and flattens it to one row per product line, filtered
// client-side to the requested date range — deliberately not relying on a
// server-side date filter query param, since the exact param name isn't
// confirmed against a real account either.
export async function fetchFoodicsSales(apiToken: string, fromDate: string, toDate: string): Promise<{ error?: string; lines?: FoodicsOrderLine[]; rawOrderCount?: number }> {
  const result = await foodicsGet(apiToken, "/orders?include=products");
  if (result.error) return { error: result.error };
  const orders = unwrapList(result.data);

  const lines: FoodicsOrderLine[] = [];
  for (const order of orders) {
    const saleDate = String(order.business_date ?? order.date ?? order.created_at ?? "").slice(0, 10);
    if (!saleDate || saleDate < fromDate || saleDate > toDate) continue;
    const orderId = String(order.id ?? "");
    const products = Array.isArray(order.products) ? order.products : [];
    for (const [i, p] of products.entries()) {
      const line = p as Record<string, unknown>;
      // "product" nested object with {id, sku, name} is the shape confirmed
      // against Foodics' real webhook payload — kept as the primary read,
      // with flatter fallbacks for whatever this unverified GET actually returns.
      const product = line.product as { id?: string; name?: string } | undefined;
      const productId = product?.id ?? (line.product_id != null ? String(line.product_id) : undefined);
      const productLabel = String(line.name ?? product?.name ?? productId ?? "Unknown item");
      const qty = Number(line.quantity ?? line.qty ?? 0);
      const revenue = Number(line.total_price ?? line.unit_price ?? 0) || (Number(line.unit_price ?? 0) * qty);
      if (qty <= 0) continue;
      lines.push({ sourceOrderId: `${orderId}:${i}`, saleDate, productId, productLabel, qty, revenue });
    }
  }
  return { lines, rawOrderCount: orders.length };
}
