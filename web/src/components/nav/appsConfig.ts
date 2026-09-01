import type { PermissionSectionKey } from "@/server/db/schema";

export type AppNavItem = { href: string; label: string; ico: string; section: PermissionSectionKey | null };
// color/colorDark are the launcher tile's gradient endpoints — colorDark is
// a hand-picked darker shade of color (not derived at runtime) so it works
// the same in every browser without a color-mix()/CSS-variable dependency.
export type AppDef = { id: string; label: string; icon: string; color: string; colorDark: string; items: AppNavItem[] };

// Single source of truth for both the post-login Apps launcher (one tile per
// entry) and the Sidebar (which, once inside an app, only ever renders that
// one app's own items — see SidebarNav). Splits the old flat Sidebar groups
// a little finer than before (Recipe Costing / Production, and Reports /
// Print Center / Settings) precisely so a role scoped to e.g. just
// `subrecipes` gets a Production-only launcher tile *and* a Production-only
// sidebar, instead of still being bundled in with unrelated pages.
export const APPS: AppDef[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "◆",
    color: "#0a5a96",
    colorDark: "#073f6b",
    items: [
      { href: "/dashboard?tab=overview", label: "Overview", ico: "◆", section: null },
      { href: "/dashboard?tab=purchasing", label: "Purchasing Dashboard", ico: "💳", section: "reports" },
      { href: "/dashboard?tab=suppliers", label: "Supplier Dashboard", ico: "🚚", section: "reports" },
      { href: "/dashboard?tab=cost", label: "Cost Dashboard", ico: "📊", section: "reports" },
      { href: "/dashboard?tab=cogs", label: "COGS Analysis", ico: "🍳", section: "reports" },
      { href: "/dashboard?tab=menuengineering", label: "Menu Engineering", ico: "🍽", section: "reports" },
      { href: "/dashboard?tab=costcenter", label: "Cost by Sector", ico: "🏢", section: "reports" },
      { href: "/dashboard?tab=salesdashboard", label: "Sales Dashboard", ico: "💰", section: "reports" },
      { href: "/dashboard?tab=salesvspurchases", label: "Sales vs Purchases", ico: "⚖️", section: "reports" },
    ],
  },
  { id: "scanner", label: "Scanner", icon: "📷", color: "#3a7d44", colorDark: "#285a2f", items: [{ href: "/scanner", label: "Scanner", ico: "📷", section: null }] },
  {
    id: "inventory",
    label: "Inventory",
    icon: "▤",
    color: "#b2673e",
    colorDark: "#8a4c2a",
    items: [
      { href: "/products", label: "Product Master", ico: "▤", section: "items" },
      { href: "/expiry", label: "Expiry Tracking", ico: "⏱", section: "items" },
      { href: "/settings", label: "Categories & Storage", ico: "⚑", section: "branchsettings" },
      { href: "/units", label: "Units of Measurement", ico: "📐", section: "branchsettings" },
    ],
  },
  {
    id: "purchasing",
    label: "Purchasing",
    icon: "★",
    color: "#caa63d",
    colorDark: "#a3822a",
    items: [
      { href: "/suppliers", label: "Suppliers", ico: "★", section: "suppliers" },
      { href: "/purchase-orders", label: "Purchase Orders", ico: "▤", section: "orders" },
      { href: "/predictive-orders", label: "Predictive Orders", ico: "🔮", section: "orders" },
      { href: "/grn", label: "Goods Receiving (GRN)", ico: "▦", section: "grn" },
      { href: "/invoices", label: "Invoices", ico: "🧾", section: "suppliers" },
      { href: "/credit-notes", label: "Credit Notes", ico: "↩", section: "grn" },
      { href: "/supplier-returns", label: "Supplier Returns", ico: "📤", section: "grn" },
      { href: "/consolidated-invoices", label: "Consolidated Invoices", ico: "🧮", section: "grn" },
      { href: "/material-requests", label: "Material Requests", ico: "📋", section: "orders" },
    ],
  },
  {
    id: "menu",
    label: "Menu",
    icon: "🍽",
    color: "#c2447a",
    colorDark: "#9c2f5e",
    items: [
      { href: "/menu/categories", label: "Categories", ico: "🗂", section: "recipes" },
      { href: "/menu/products", label: "Products", ico: "🍽", section: "recipes" },
      { href: "/menu/modifiers", label: "Modifiers", ico: "➕", section: "recipes" },
      { href: "/menu/combos", label: "Combos", ico: "🍱", section: "recipes" },
      { href: "/menu/coming-soon", label: "Groups", ico: "📁", section: "recipes" },
    ],
  },
  {
    id: "recipes",
    label: "Recipe Costing",
    icon: "∑",
    color: "#6a4fb3",
    colorDark: "#4f3888",
    items: [
      { href: "/recipes", label: "Recipe Costing", ico: "∑", section: "recipes" },
      { href: "/recipes/sub-categories", label: "Sub-Recipe Categories", ico: "🗂", section: "subrecipes" },
    ],
  },
  { id: "production", label: "Production", icon: "⚙", color: "#2f8f8f", colorDark: "#216565", items: [{ href: "/production", label: "Production", ico: "⚙", section: "subrecipes" }] },
  {
    id: "operations",
    label: "Operations",
    icon: "🗑",
    color: "#b23a2e",
    colorDark: "#8a2a20",
    items: [
      { href: "/wastage", label: "Wastage Tracking", ico: "🗑", section: "wastage" },
      { href: "/transfers", label: "Stock Transfers", ico: "⇄", section: "transfers" },
      { href: "/stock-count", label: "Stock Count", ico: "☑", section: "stockcount" },
    ],
  },
  {
    id: "ck",
    label: "Central Kitchen",
    icon: "📦",
    color: "#4d6a92",
    colorDark: "#34496b",
    items: [
      { href: "/ck-warehouse", label: "Incoming Orders", ico: "📦", section: "ckwarehouse" },
      { href: "/ck-sales", label: "CK Sales & Delivery Notes", ico: "🚚", section: "ckwarehouse" },
      { href: "/customers", label: "Customers", ico: "👥", section: "ckwarehouse" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "📊",
    color: "#3f7d5c",
    colorDark: "#2c5c42",
    items: [
      { href: "/reports?tab=sales", label: "Recipe Sales", ico: "💵", section: "reports" },
      { href: "/reports?tab=stock", label: "Stock Page", ico: "📦", section: "reports" },
      { href: "/reports?tab=varianceanalysis", label: "Variance Analysis", ico: "⚖", section: "reports" },
      { href: "/reports?tab=slowmoving", label: "Slow Moving Items", ico: "🐌", section: "reports" },
      { href: "/reports?tab=pricechange", label: "Item Price Change", ico: "🔺", section: "reports" },
      { href: "/reports?tab=costadjustments", label: "Cost Adjustments", ico: "🧮", section: "reports" },
      { href: "/reports?tab=sections", label: "Cost by Brand & Section", ico: "🗂", section: "reports" },
      { href: "/reports?tab=purchaseorders", label: "Purchase Orders", ico: "▤", section: "reports" },
      { href: "/reports?tab=grns", label: "GRNs", ico: "▦", section: "reports" },
      { href: "/reports?tab=supplierreturns", label: "Supplier Returns", ico: "📤", section: "reports" },
      { href: "/reports?tab=invoices", label: "Invoices", ico: "🧾", section: "reports" },
      { href: "/reports?tab=wastage", label: "Wastage", ico: "🗑", section: "reports" },
      { href: "/reports?tab=transfers", label: "Transfers", ico: "⇄", section: "reports" },
      { href: "/reports?tab=stockcounts", label: "Stock Counts", ico: "☑", section: "reports" },
      { href: "/reports?tab=production", label: "Production", ico: "🍳", section: "reports" },
    ],
  },
  { id: "print-center", label: "Print Center", icon: "🖨", color: "#7a5c8f", colorDark: "#5b4269", items: [{ href: "/print-center", label: "Print Center", ico: "🖨", section: null }] },
  {
    id: "settings",
    label: "Settings",
    icon: "🔐",
    color: "#5a5f66",
    colorDark: "#3f434a",
    items: [
      { href: "/devices", label: "Devices", ico: "🖧", section: "system" },
      { href: "/audit", label: "Audit Trail", ico: "📜", section: "system" },
      { href: "/policies", label: "Policies & Approvals", ico: "⚖", section: "policies" },
      { href: "/permissions", label: "User Permission", ico: "🔐", section: "permissions" },
      { href: "/system-settings", label: "Settings", ico: "⚙", section: "system" },
    ],
  },
];

/** Strips a query string, if any, for pathname comparison. */
function pathOf(href: string): string {
  const q = href.indexOf("?");
  return q === -1 ? href : href.slice(0, q);
}

/** Same "is this link active" rule NavLink uses, reused here to find which app a pathname belongs to. */
export function matchesItem(pathname: string, href: string): boolean {
  const path = pathOf(href);
  return pathname === path || (path !== "/dashboard" && pathname.startsWith(path + "/"));
}

export function findAppForPath(apps: AppDef[], pathname: string): AppDef | undefined {
  return apps.find((app) => app.items.some((item) => matchesItem(pathname, item.href)));
}
