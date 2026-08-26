"use server";

import { db } from "@/server/db";
import { getSession, hasAccess } from "@/server/auth/session";
import { branches, suppliers, invoicesHistorical, stockItems, stockBalances, wastageEvents, mainRecipes, subRecipes } from "@/server/db/schema";
import type { PermissionSectionKey } from "@/server/db/schema";
import { PERMISSION_SECTION_LABELS } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { bestTextMatch } from "@/lib/textMatch";
import { money, fmt, todayStr } from "@/lib/format";
import { getReorderAlertCount, getPredictiveOrderSuggestions } from "@/server/db/queries/forecasting";
import { getSalesTodayStats } from "@/server/db/queries/sales";
import { getPurchasingStats } from "@/server/db/queries/reports";
import { listExpiringBatches, EXPIRY_BUCKET_ORDER } from "@/server/db/queries/expiry";
import { listProductionBatches } from "@/server/db/queries/production";
import { loadCostingGraph, recipeCurrentCost } from "@/server/costing/recipeCost";

export type AskAssistantResult = { answer: string };

// Words that carry no meaning for entity extraction (which supplier / item /
// recipe is this question actually about) — stripped, along with each
// intent's own trigger words, before fuzzy-matching whatever's left against
// the real catalog. Feeding the *whole* question into bestTextMatch scores
// too low (its token-overlap ratio is diluted by all this filler), so this
// step is what makes "how much do we owe sunberry" actually resolve to
// "SUNBERRY VEGETABLE AND FRUIT TRADING LLC".
const STOPWORDS = new Set([
  "how", "much", "many", "do", "does", "did", "we", "is", "are", "was", "were", "whats", "what's", "what", "show", "me",
  "tell", "the", "a", "an", "of", "for", "to", "in", "on", "at", "this", "that", "have", "has", "got", "please", "can",
  "you", "i", "us", "our", "right", "now", "there", "any",
]);

function extractEntity(question: string, extraStop: string[]): string {
  const extra = new Set(extraStop);
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !extra.has(w))
    .join(" ")
    .trim();
}

function denied(section: PermissionSectionKey): string {
  return `You don't have access to ${PERMISSION_SECTION_LABELS[section]} information.`;
}

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;
type Intent = { test: (q: string) => boolean; handle: (question: string, qLower: string, session: Session) => Promise<string> };

const INTENTS: Intent[] = [
  // Supplier payables — "how much do we owe X" / "outstanding for X"
  {
    test: (q) => /\bowe\b|\boutstanding\b|\bpayable/.test(q),
    handle: async (question, qLower, session) => {
      if (!hasAccess(session, "suppliers", "view")) return denied("suppliers");
      const entity = extractEntity(question, ["owe", "outstanding", "payable", "payables", "supplier"]);
      const allSuppliers = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);

      if (!entity) {
        const [row] = await db
          .select({ total: sql<number>`coalesce(sum(${invoicesHistorical.total}), 0)`, count: sql<number>`count(distinct ${invoicesHistorical.supplierId})` })
          .from(invoicesHistorical)
          .where(eq(invoicesHistorical.status, "OUTSTANDING"));
        const total = Number(row?.total ?? 0);
        return total > 0 ? `You owe ${money(total, 2)} in total, across ${row.count} supplier(s).` : "Nothing outstanding right now — all invoices are settled.";
      }

      const match = bestTextMatch(entity, allSuppliers, (s) => s.name);
      if (!match) return `I couldn't find a supplier matching "${entity}".`;
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${invoicesHistorical.total}), 0)` })
        .from(invoicesHistorical)
        .where(sql`${invoicesHistorical.supplierId} = ${match.id} and ${invoicesHistorical.status} = 'OUTSTANDING'`);
      const total = Number(row?.total ?? 0);
      return total > 0 ? `You owe ${match.name} ${money(total, 2)}.` : `You don't owe ${match.name} anything right now.`;
    },
  },

  // Low stock / reorder alerts
  {
    test: (q) => (/\blow\b/.test(q) && /\bstock\b/.test(q)) || /reorder|restock|need(s)? (to )?order/.test(q),
    handle: async (_q, _qLower, session) => {
      if (!hasAccess(session, "orders", "view")) return denied("orders");
      const allBranches = await db.select({ id: branches.id }).from(branches);
      const low: { name: string }[] = [];
      for (const b of allBranches) {
        const { rows } = await getPredictiveOrderSuggestions(b.id);
        for (const r of rows) if (r.status === "low") low.push({ name: r.name });
      }
      if (low.length === 0) return "Nothing needs reordering right now — everything's on track.";
      const names = [...new Set(low.map((r) => r.name))];
      const shown = names.slice(0, 6).join(", ");
      return `${names.length} item(s) need reordering: ${shown}${names.length > 6 ? `, and ${names.length - 6} more` : ""}.`;
    },
  },

  // Sales today
  {
    test: (q) => /today/.test(q) && /(sale|sold|revenue)/.test(q),
    handle: async (_q, _qLower, session) => {
      if (!hasAccess(session, "reports", "view")) return denied("reports");
      const stats = await getSalesTodayStats(todayStr());
      return stats.orderCount > 0
        ? `${money(stats.revenue, 2)} from ${fmt(stats.qty, 0)} recipe(s) sold across ${stats.orderCount} order(s) today.`
        : "No sales recorded yet today.";
    },
  },

  // Purchasing spend
  {
    test: (q) => /\bspen(d|t)\b|\bpurchas(e|ing)\b/.test(q),
    handle: async (_q, _qLower, session) => {
      if (!hasAccess(session, "reports", "view")) return denied("reports");
      const stats = await getPurchasingStats();
      return `All-time purchase spend is ${money(stats.totalSpend, 2)}, with ${money(stats.outstanding, 2)} still outstanding across ${stats.outstandingCount} invoice(s).`;
    },
  },

  // Expiring items
  {
    test: (q) => /expir/.test(q),
    handle: async (_q, _qLower, session) => {
      if (!hasAccess(session, "items", "view")) return denied("items");
      const rows = await listExpiringBatches();
      const soonBuckets = new Set(EXPIRY_BUCKET_ORDER.slice(0, 4)); // EXPIRED, TODAY, TOMORROW, 7 DAYS
      const soon = rows.filter((r) => soonBuckets.has(r.bucket));
      if (soon.length === 0) return "Nothing expiring within the next 7 days.";
      const names = [...new Set(soon.map((r) => r.name))].slice(0, 6);
      return `${soon.length} batch(es) expiring within a week: ${names.join(", ")}${soon.length > names.length ? ", and more" : ""}.`;
    },
  },

  // Recipe cost lookup — "how much does X cost" / "cost of X"
  {
    test: (q) => /\bcost\b/.test(q),
    handle: async (question, _qLower, session) => {
      const canMain = hasAccess(session, "recipes", "view");
      const canSub = hasAccess(session, "subrecipes", "view");
      if (!canMain && !canSub) return denied("recipes");

      const entity = extractEntity(question, ["cost", "costs", "recipe"]);
      if (!entity) return "Which recipe would you like the cost for?";

      const graph = await loadCostingGraph();
      const candidates: { id: string; name: string; isMain: boolean }[] = [
        ...(canMain ? graph.mainRecipes.map((r) => ({ id: r.id, name: r.name, isMain: true })) : []),
        ...(canSub ? [...graph.subRecipesById.values()].map((r) => ({ id: r.id, name: r.name, isMain: false })) : []),
      ];
      const match = bestTextMatch(entity, candidates, (c) => c.name);
      if (!match) return `I couldn't find a recipe matching "${entity}".`;

      const node = match.isMain ? graph.mainRecipesById.get(match.id) : graph.subRecipesById.get(match.id);
      if (!node) return `I couldn't find a recipe matching "${entity}".`;
      const cur = recipeCurrentCost(graph, node);
      const unit = match.isMain ? "portion" : node.yieldUnit || "unit";
      return `${match.name} costs ${money(cur.perUnit, 3)} per ${unit} (${money(cur.total, 2)} per batch).`;
    },
  },

  // Stock level of an item — "how much X do we have" / "stock of X"
  {
    test: (q) => /stock of|quantity of|in stock|do we have/.test(q),
    handle: async (question, _qLower, session) => {
      if (!hasAccess(session, "items", "view")) return denied("items");
      const entity = extractEntity(question, ["stock", "quantity", "level", "item"]);
      if (!entity) return "Which item would you like the stock level for?";

      const items = await db.select({ id: stockItems.id, name: stockItems.name, issueUnit: stockItems.issueUnit }).from(stockItems).where(eq(stockItems.isActive, true));
      const match = bestTextMatch(entity, items, (i) => i.name);
      if (!match) return `I couldn't find a product matching "${entity}".`;

      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${stockBalances.qtyOnHand}), 0)` })
        .from(stockBalances)
        .where(eq(stockBalances.stockItemId, match.id));
      const qty = Number(row?.total ?? 0);
      return `You have ${fmt(qty, 2)} ${match.issueUnit ?? ""} of ${match.name} on hand.`.replace(/\s+/g, " ");
    },
  },

  // Production status
  {
    test: (q) => /production|batch(es)?/.test(q) && /open|progress|status|running/.test(q),
    handle: async (_q, _qLower, session) => {
      if (!hasAccess(session, "subrecipes", "view")) return denied("subrecipes");
      const rows = await listProductionBatches({ status: "OPEN" });
      if (rows.length === 0) return "Nothing in production right now.";
      const names = [...new Set(rows.map((r) => r.subRecipeName))].slice(0, 6);
      return `${rows.length} batch(es) currently open: ${names.join(", ")}${rows.length > names.length ? ", and more" : ""}.`;
    },
  },

  // Wastage today
  {
    test: (q) => /wastage|\bwaste\b/.test(q),
    handle: async (_q, _qLower, session) => {
      if (!hasAccess(session, "wastage", "view")) return denied("wastage");
      const today = todayStr();
      const rows = await db
        .select({ amount: sql<number>`coalesce(sum(${wastageEvents.totalCost}), 0)` })
        .from(wastageEvents)
        .where(sql`${wastageEvents.eventDate} = ${today} and ${wastageEvents.status} = 'POSTED'`);
      const amount = Number(rows[0]?.amount ?? 0);
      return amount > 0 ? `${money(amount, 2)} logged in wastage today.` : "No wastage logged today.";
    },
  },

  // Help / greeting
  {
    test: (q) => /^(hi|hello|hey|help)\b/.test(q) || q.length < 4,
    handle: async () => HELP_TEXT,
  },
];

const HELP_TEXT =
  'Try asking things like: "what\'s low on stock", "how much do we owe Sunberry", "sales today", ' +
  '"how much does Avocado Toast cost", "how much cheese do we have in stock", "what\'s expiring soon", ' +
  '"what\'s in production", or "wastage today".';

export async function askAssistant(question: string): Promise<AskAssistantResult> {
  const session = await getSession();
  if (!session) return { answer: "You need to be signed in to ask me anything." };

  const q = question.trim();
  if (!q) return { answer: HELP_TEXT };
  const qLower = q.toLowerCase();

  const intent = INTENTS.find((i) => i.test(qLower));
  if (!intent) return { answer: `I'm not sure how to answer that yet. ${HELP_TEXT}` };

  const answer = await intent.handle(q, qLower, session);
  return { answer };
}
