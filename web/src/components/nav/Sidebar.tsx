import Link from "next/link";
import { getSession, hasAccess } from "@/server/auth/session";
import { logout } from "@/server/actions/auth";
import { NavLink } from "./NavLink";
import { NavGroup } from "./NavGroup";
import { Logo } from "@/components/ui/Logo";
import type { PermissionSectionKey } from "@/server/db/schema";

type NavItem = { href: string; label: string; ico: string; section: PermissionSectionKey | null };
type NavGroupDef = { id: string; label: string; items: NavItem[] };

// Grouped by real workflow area rather than one-group-per-page — keeps the
// sidebar scannable as more modules land (Production, Wastage, Transfers,
// Stock Count) instead of growing into a flat list of single-item groups.
const NAV: NavGroupDef[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", ico: "◆", section: null },
      { href: "/scanner", label: "Scanner", ico: "📷", section: null },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
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
    id: "recipes-production",
    label: "Recipes & Production",
    items: [
      { href: "/recipes", label: "Recipe Costing", ico: "∑", section: "recipes" },
      { href: "/production", label: "Production", ico: "⚙", section: "subrecipes" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/wastage", label: "Wastage Tracking", ico: "🗑", section: "wastage" },
      { href: "/transfers", label: "Stock Transfers", ico: "⇄", section: "transfers" },
      { href: "/stock-count", label: "Stock Count", ico: "☑", section: "stockcount" },
    ],
  },
  {
    id: "ck-sales",
    label: "Central Kitchen",
    items: [
      { href: "/ck-warehouse", label: "Incoming Orders", ico: "📦", section: "ckwarehouse" },
      { href: "/ck-sales", label: "CK Sales & Delivery Notes", ico: "🚚", section: "ckwarehouse" },
      { href: "/customers", label: "Customers", ico: "👥", section: "ckwarehouse" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { href: "/reports", label: "Reports", ico: "📊", section: "reports" },
      { href: "/print-center", label: "Print Center", ico: "🖨", section: null },
      { href: "/devices", label: "Devices", ico: "🖧", section: "system" },
      { href: "/audit", label: "Audit Trail", ico: "📜", section: "system" },
      { href: "/policies", label: "Policies & Approvals", ico: "⚖", section: "policies" },
      { href: "/permissions", label: "User Permission", ico: "🔐", section: "permissions" },
      { href: "/system-settings", label: "Settings", ico: "⚙", section: "system" },
    ],
  },
];

export async function Sidebar() {
  const session = await getSession();

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-text">
          <Logo height={42} />
          <span>Inventory Management</span>
        </div>
      </div>
      <div className="nav">
        {NAV.map((group) => {
          // Sections the user has no access to are left out of their
          // sidebar entirely rather than shown locked — a role's nav should
          // only ever list what it can actually open.
          const visibleItems = group.items.filter((item) => !item.section || !session || hasAccess(session, item.section, "view"));
          if (visibleItems.length === 0) return null;
          return (
            <NavGroup key={group.id} id={group.id} label={group.label}>
              {visibleItems.map((item) => {
                const viewOnly = !!(session && item.section && session.permissions[item.section] === "view");
                return <NavLink key={item.href} href={item.href} label={item.label} ico={item.ico} viewOnly={viewOnly} />;
              })}
            </NavGroup>
          );
        })}
      </div>
      <div className="sidebar-foot">
        {session && (
          <div className="sidebar-user" style={{ marginTop: 10 }}>
            <span>
              <b>{session.profile.name}</b>
              <br />
              {session.role.name}
              <br />
              <Link href="/set-password" style={{ fontSize: 11 }}>Change Password</Link>
            </span>
            <form action={logout}>
              <button type="submit" className="logout-btn">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
