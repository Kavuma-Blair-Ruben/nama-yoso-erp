import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { posIntegrations, posWebhookEvents, posBranchMappings, posItemMappings, recipeSales, posOrders } from "@/server/db/schema";
import { recordStockMovement } from "@/server/db/stockLedger";
import { loadCostingGraph, recipeCurrentCost, flattenRecipeToStockLines } from "@/server/costing/recipeCost";
import { todayStr } from "@/lib/format";

// No logged-in session here — Foodics calls this directly, authenticated
// only by the long random token in the URL path (Foodics documents no
// signature/HMAC scheme for webhooks). Foodics expects a response within 5
// seconds, retries up to 2 more times on non-2xx, and blocks the URL for an
// hour after 100 failures in a minute — so this handler stays fast and
// always acks 2xx once the request itself is authenticated, even when a
// line can't be processed (an unmapped branch/item is not Foodics' fault
// to retry).

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

type FoodicsOrderPayload = {
  event?: string;
  timestamp?: number;
  order?: {
    id?: string;
    reference?: string;
    business_date?: string;
    subtotal_price?: number;
    discount_amount?: number;
    total_price?: number;
    branch?: { id?: string; name?: string };
    products?: { product?: { id?: string; name?: string }; quantity?: number; total_price?: number }[];
  };
};

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [integration] = await db.select().from(posIntegrations).where(eq(posIntegrations.id, "foodics"));
  if (!integration?.webhookSecret || !secretsMatch(token, integration.webhookSecret)) {
    return new NextResponse(null, { status: 404 });
  }

  let body: FoodicsOrderPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.event !== "order.created") {
    return NextResponse.json({ ok: true, skipped: "event type not handled" });
  }

  const order = body.order;
  const externalOrderId = order?.id;
  const externalBranchId = order?.branch?.id;
  if (!externalOrderId || !externalBranchId || !Array.isArray(order?.products)) {
    // Malformed payload for an order.created event — nothing sensible to
    // retry into, and no order id means no idempotency key to log against.
    return NextResponse.json({ ok: true, skipped: "malformed order payload" });
  }

  // business_date (the operating day Foodics itself assigns the order to)
  // is the more accurate signal when present — falls back to the webhook
  // delivery timestamp, then today, for payloads that omit it.
  const saleDate = order.business_date ?? (body.timestamp ? new Date(body.timestamp * 1000).toISOString().slice(0, 10) : todayStr());

  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(posWebhookEvents)
      .values({ provider: "foodics", externalOrderId, eventType: body.event!, rawPayload: body })
      .onConflictDoNothing({ target: [posWebhookEvents.provider, posWebhookEvents.externalOrderId] })
      .returning({ id: posWebhookEvents.id });
    if (!inserted) return; // duplicate delivery (Foodics retry, or a resent order.updated) — already processed

    let [branchMap] = await tx
      .select()
      .from(posBranchMappings)
      .where(and(eq(posBranchMappings.provider, "foodics"), eq(posBranchMappings.externalBranchId, externalBranchId)));
    if (!branchMap) {
      const [created] = await tx
        .insert(posBranchMappings)
        .values({ provider: "foodics", externalBranchId, externalBranchName: order.branch?.name })
        .onConflictDoNothing({ target: [posBranchMappings.provider, posBranchMappings.externalBranchId] })
        .returning();
      branchMap = created ?? branchMap;
      if (!branchMap) {
        [branchMap] = await tx
          .select()
          .from(posBranchMappings)
          .where(and(eq(posBranchMappings.provider, "foodics"), eq(posBranchMappings.externalBranchId, externalBranchId)));
      }
    }

    // Order-level financial totals — inserted regardless of branch-mapping
    // status, same tolerance posWebhookEvents already extends to an
    // unmapped branch, since gross/discount/net reporting is still useful
    // before item/branch mapping is finished.
    await tx
      .insert(posOrders)
      .values({
        provider: "foodics",
        externalOrderId,
        branchId: branchMap?.branchId ?? null,
        saleDate,
        grossAmount: order.subtotal_price ?? order.total_price ?? 0,
        discountAmount: order.discount_amount ?? 0,
        netAmount: order.total_price ?? 0,
      })
      .onConflictDoNothing({ target: [posOrders.provider, posOrders.externalOrderId] });

    if (!branchMap?.branchId || !branchMap?.costCenterId) {
      await tx
        .update(posWebhookEvents)
        .set({ processedAt: new Date(), processNotes: `Branch "${order.branch?.name ?? externalBranchId}" isn't mapped to a branch/sector yet — order held, no stock deducted.` })
        .where(eq(posWebhookEvents.id, inserted.id));
      return;
    }

    const graph = await loadCostingGraph();
    const skippedLines: string[] = [];

    for (const [i, line] of order.products!.entries()) {
      const externalProductId = line.product?.id;
      const productLabel = line.product?.name ?? externalProductId ?? "Unknown item";
      const qty = line.quantity ?? 0;
      if (qty <= 0 || !externalProductId) continue;

      let [itemMap] = await tx
        .select()
        .from(posItemMappings)
        .where(and(eq(posItemMappings.provider, "foodics"), eq(posItemMappings.externalProductId, externalProductId)));
      if (!itemMap) {
        const [created] = await tx
          .insert(posItemMappings)
          .values({ provider: "foodics", externalProductId, externalProductName: productLabel })
          .onConflictDoNothing({ target: [posItemMappings.provider, posItemMappings.externalProductId] })
          .returning();
        itemMap = created ?? itemMap;
        if (!itemMap) {
          [itemMap] = await tx
            .select()
            .from(posItemMappings)
            .where(and(eq(posItemMappings.provider, "foodics"), eq(posItemMappings.externalProductId, externalProductId)));
        }
      }

      if (itemMap?.mainRecipeId) {
        const recipeNode = graph.mainRecipesById.get(itemMap.mainRecipeId);
        if (recipeNode) {
          const cur = recipeCurrentCost(graph, recipeNode);
          const stockLines = flattenRecipeToStockLines(cur.lines, qty);
          for (const sl of stockLines) {
            await recordStockMovement(tx, {
              stockItemId: sl.stockItemId,
              branchId: branchMap.branchId,
              costCenterId: branchMap.costCenterId,
              qtyDelta: -sl.qty,
              unitLabel: sl.unitLabel,
              movementType: "POS_SALE",
              refType: "pos_order",
              refId: inserted.id,
              notes: `Foodics order ${order.reference ?? externalOrderId}`,
            });
          }
        } else {
          skippedLines.push(`${productLabel} (mapped recipe no longer exists)`);
        }
      } else {
        skippedLines.push(productLabel);
      }

      await tx
        .insert(recipeSales)
        .values({
          saleDate,
          mainRecipeId: itemMap?.mainRecipeId ?? undefined,
          itemLabel: productLabel,
          qty,
          revenue: line.total_price ?? 0,
          source: "foodics",
          sourceOrderId: `${externalOrderId}:${i}`,
        })
        .onConflictDoNothing({ target: [recipeSales.source, recipeSales.sourceOrderId] });
    }

    await tx
      .update(posWebhookEvents)
      .set({ processedAt: new Date(), processNotes: skippedLines.length ? `Unmapped item(s), no stock deducted: ${skippedLines.join(", ")}` : null })
      .where(eq(posWebhookEvents.id, inserted.id));
  });

  return NextResponse.json({ ok: true });
}
