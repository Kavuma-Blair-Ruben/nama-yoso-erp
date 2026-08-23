import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  pgSequence,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  primaryKey,
  unique,
  check,
} from "drizzle-orm/pg-core";

// Money/quantity columns use numeric with mode:'number' for ergonomics —
// consistent with the original index.html, which also does all math as JS
// floats. Precision loss risk is the same as the app being replaced.
const money = (name: string) => numeric(name, { precision: 14, scale: 4, mode: "number" });

/* ============================================================
   auth.users — Supabase-managed, NOT created by this schema.
   `profiles.id` is a plain PK; the FK `REFERENCES auth.users(id)
   ON DELETE CASCADE` is added by hand-editing the first generated
   migration file (see scripts note), not by drizzle-kit, so drizzle
   never tries to manage the `auth` schema.
   ============================================================ */

/* ============================================================
   Lookups
   ============================================================ */
export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // NAMAYOSO, THG
  name: text("name").notNull(),
});

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    legacyNames: text("legacy_names").array().notNull().default(sql`'{}'::text[]`),
    trn: text("trn"),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    paymentTerms: text("payment_terms"),
    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
    // Policy limits — warned (not blocked) against at PO/GRN creation time,
    // same non-blocking behavior as index.html's checkOrderingLimit/
    // checkReceivingLimit.
    orderLimitAmount: money("order_limit_amount"),
    orderLimitFrequency: text("order_limit_frequency"),
    receivingLimitAmount: money("receiving_limit_amount"),
    receivingLimitFrequency: text("receiving_limit_frequency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("suppliers_order_limit_frequency_check", sql`${t.orderLimitFrequency} is null or ${t.orderLimitFrequency} in ('daily','weekly','monthly')`),
    check("suppliers_receiving_limit_frequency_check", sql`${t.receivingLimitFrequency} is null or ${t.receivingLimitFrequency} in ('daily','weekly','monthly')`),
  ]
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const subcategories = pgTable(
  "subcategories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [unique().on(t.categoryId, t.name)]
);

export const storageTypeEnum = pgEnum("storage_type", ["DRY", "CHILLED", "FROZEN"]);

export const costCenters = pgTable("cost_centers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});

export const storageAreas = pgTable("storage_areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});

// Hardware registered without a wired/USB connection to this server — a
// network-attached label/receipt printer reachable by IP, or a
// Bluetooth/WiFi barcode scanner noted for reference (those pair directly
// with the phone/tablet running the browser, not with this server, so
// there's nothing to "connect" server-side for them — registering one here
// is just a durable record of what's deployed and where).
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'label_printer' | 'receipt_printer' | 'barcode_scanner' | 'other'
    connection: text("connection").notNull(), // 'network' | 'bluetooth' | 'wifi_direct' | 'printnode' | 'other'
    address: text("address"), // IP (and optionally :port) for network devices; free text otherwise
    // Set only when connection = 'printnode' — the printer's id in PrintNode's
    // API (see src/lib/printnode.ts). PrintNode relays jobs through a free
    // client app running on any PC on the printer's own network, so this is
    // how a cloud-hosted server (no path into anyone's private LAN) can still
    // reach it — unlike 'network', which needs the server itself to be on
    // the same network as the printer.
    printnodePrinterId: integer("printnode_printer_id"),
    branchId: uuid("branch_id").references(() => branches.id),
    notes: text("notes"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestStatus: text("last_test_status"),
    lastTestOk: boolean("last_test_ok"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("devices_type_check", sql`${t.type} in ('label_printer','receipt_printer','barcode_scanner','other')`),
    check("devices_connection_check", sql`${t.connection} in ('network','bluetooth','wifi_direct','printnode','other')`),
  ]
);

export const wastageReasons = pgTable("wastage_reasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  // Matches index.html's per-reason "Expense" checkbox — excludes wastage
  // logged under this reason from COGS reporting. No report reads this flag
  // yet in the new app; it's captured now so a future COGS report doesn't
  // need a data migration to backfill it.
  isExpense: boolean("is_expense").notNull().default(false),
});

export const taxRates = pgTable("tax_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  pct: numeric("pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
});

// Single-row settings table (id always "default") — just costing method for
// now. Matches index.html's own "honest note": recipe/stock costing always
// uses the latest price regardless of what's selected here; a true moving-
// or weighted-average engine would need to track running cost per item from
// GRN history over time, a real engineering change, not a toggle. Recorded
// so the intent is on the record for whoever builds that next.
export const systemSettings = pgTable(
  "system_settings",
  {
    id: text("id").primaryKey().default("default"),
    costingMethod: text("costing_method").notNull().default("latest"),
    // Hides System Qty and Variance from the Stock Count builder while
    // counting is in progress, so counters can't just copy the expected
    // number — variance is still computed and stored, just not shown live.
    blindCounts: boolean("blind_counts").notNull().default(false),
  },
  (t) => [check("system_settings_costing_method_check", sql`${t.costingMethod} in ('latest','moving_average','weighted_average')`)]
);

// Location-level order limits + global policy toggles ported from
// index.html's Policies & Approvals page — all warn-only at PO/GRN creation
// except internalOnlyLocations, which hard-blocks (matches old app exactly).
export const POLICY_LOCATIONS = ["NAMAYOSO", "THG", "Kitchen", "Bar", "Central Warehouse"] as const;

export const locationOrderLimits = pgTable(
  "location_order_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    location: text("location").notNull().unique(),
    amount: money("amount").notNull(),
    frequency: text("frequency").notNull(),
  },
  (t) => [check("location_order_limits_frequency_check", sql`${t.frequency} in ('daily','weekly','monthly','quarterly')`)]
);

export const policySettings = pgTable("policy_settings", {
  id: text("id").primaryKey().default("default"),
  abovePparOverPct: numeric("above_par_over_pct", { precision: 7, scale: 2, mode: "number" }),
  receiveAbovePricePct: numeric("receive_above_price_pct", { precision: 7, scale: 2, mode: "number" }),
  internalOnlyLocations: text("internal_only_locations").array().notNull().default(sql`'{}'::text[]`),
  // Purchase Orders at or above this value can only move DRAFT -> APPROVED by
  // a user holding poApprovalRoleId — a real block, unlike every other check
  // in this table which only ever surfaces a non-blocking warning.
  poApprovalThreshold: numeric("po_approval_threshold", { precision: 14, scale: 2, mode: "number" }),
  poApprovalRoleId: uuid("po_approval_role_id").references(() => roles.id),
});

// Per-branch receiving cap — same location/frequency/amount shape as
// locationOrderLimits, but keyed on GRN's real branchId FK rather than a
// PO's free-text deliverTo (GRN has no deliverTo concept). Warn-only, same
// as every other check here except the PO approval threshold above.
export const branchReceivingLimits = pgTable(
  "branch_receiving_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id").notNull().unique().references(() => branches.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    frequency: text("frequency").notNull(),
  },
  (t) => [check("branch_receiving_limits_frequency_check", sql`${t.frequency} in ('daily','weekly','monthly','quarterly')`)]
);

// Per-role cap on a single PO/GRN's total value — unlike every other policy
// check, this is a hard block (matches poApprovalThreshold's precedent).
// Role-based rather than literally per-individual-user, consistent with how
// every other permission/threshold concept in this app is keyed off role,
// not profile id (see poApprovalRoleId above, role_permissions). A null cap
// means unlimited for that role.
export const rolePurchaseLimits = pgTable("role_purchase_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleId: uuid("role_id").notNull().unique().references(() => roles.id, { onDelete: "cascade" }),
  maxPoAmount: money("max_po_amount"),
  maxGrnAmount: money("max_grn_amount"),
});

export const unitsOfMeasure = pgTable(
  "units_of_measure",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    factor: numeric("factor", { precision: 14, scale: 6, mode: "number" }).notNull(),
  },
  (t) => [check("units_of_measure_type_check", sql`${t.type} in ('weight','volume','count')`)]
);

/* ============================================================
   Auth / permissions
   ============================================================ */
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// The 15 fixed section keys ported from index.html's PERMISSION_SECTIONS.
export const PERMISSION_SECTION_KEYS = [
  "branchsettings",
  "items",
  "suppliers",
  "orders",
  "grn",
  "ckwarehouse",
  "recipes",
  "subrecipes",
  "wastage",
  "transfers",
  "stockcount",
  "reports",
  "system",
  "policies",
  "permissions",
] as const;
export type PermissionSectionKey = (typeof PERMISSION_SECTION_KEYS)[number];
export type PermissionLevel = "edit" | "view" | "none";

export const PERMISSION_SECTION_LABELS: Record<PermissionSectionKey, string> = {
  branchsettings: "Branch Settings",
  items: "Items",
  suppliers: "Suppliers",
  orders: "Orders",
  grn: "GRN / Purchase Invoices",
  ckwarehouse: "Central Kitchen & Warehouse",
  recipes: "Recipes",
  subrecipes: "Sub-recipes / Batch Production",
  wastage: "Wastage",
  transfers: "Transfers",
  stockcount: "Stock Count",
  reports: "Reports and Dashboards",
  system: "System (Audit Trail, Settings)",
  policies: "Policies & Approvals",
  permissions: "User Permission",
};

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    level: text("level").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.sectionKey] }),
    check("role_permissions_section_key_check", sql`${t.sectionKey} in ('branchsettings','items','suppliers','orders','grn','ckwarehouse','recipes','subrecipes','wastage','transfers','stockcount','reports','system','policies','permissions')`),
    check("role_permissions_level_check", sql`${t.level} in ('edit','view','none')`),
  ]
);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // references auth.users(id) — see note above
  name: text("name").notNull(),
  email: text("email").notNull(),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  branches: text("branches").array().notNull().default(sql`'{}'::text[]`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => profiles.id),
  action: text("action").notNull(),
  entity: text("entity"),
  entityLabel: text("entity_label"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   Core: stock items (unifies purchased products + produced
   sub-recipes — see plan section 2 for why) and recipes
   ============================================================ */
export const stockItems = pgTable(
  "stock_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legacyCode: text("legacy_code").notNull().unique(),
    sourceType: text("source_type").notNull(),
    name: text("name").notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id),
    storageType: storageTypeEnum("storage_type"),
    storageTypeRaw: text("storage_type_raw"),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    purchaseUnit: text("purchase_unit"),
    issueUnit: text("issue_unit"),
    unitWeight: numeric("unit_weight", { precision: 14, scale: 4, mode: "number" }),
    yieldPct: numeric("yield_pct", { precision: 7, scale: 4, mode: "number" }).notNull().default(1),
    netRecoveredQty: numeric("net_recovered_qty", { precision: 14, scale: 4, mode: "number" }),
    purchaseRate: money("purchase_rate"),
    ratePerKgL: numeric("rate_per_kg_l", { precision: 14, scale: 6, mode: "number" }),
    ratePerGMl: numeric("rate_per_g_ml", { precision: 14, scale: 8, mode: "number" }),
    isActive: boolean("is_active").notNull().default(true),
    // Item Setup fields (ported from index.html's Item Setup panel)
    accountingCategory: text("accounting_category"),
    secondaryName: text("secondary_name"),
    branches: text("branches").array().notNull().default(sql`'{}'::text[]`), // empty = all branches
    minLevel: numeric("min_level", { precision: 14, scale: 4, mode: "number" }),
    parLevel: numeric("par_level", { precision: 14, scale: 4, mode: "number" }), // canonical basis, same as minLevel — "Fill Cart to Par" target
    preferredCountingUnit: text("preferred_counting_unit"),
    defaultPrepWastagePct: numeric("default_prep_wastage_pct", { precision: 5, scale: 2, mode: "number" }),
    itemTaxRate: numeric("item_tax_rate", { precision: 5, scale: 2, mode: "number" }), // null = use system default
    nonCogs: boolean("non_cogs").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("stock_items_source_type_check", sql`${t.sourceType} in ('purchased','produced')`)]
);

export const productSupplierPackaging = pgTable("product_supplier_packaging", {
  id: uuid("id").primaryKey().defaultRandom(),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  purchaseUnit: text("purchase_unit"),
  unitWeight: numeric("unit_weight", { precision: 14, scale: 4, mode: "number" }),
  rate: money("rate"),
  supplierItemName: text("supplier_item_name"),
  supplierItemCode: text("supplier_item_code"),
  isPriority: boolean("is_priority").notNull().default(false),
});

export const mainRecipes = pgTable("main_recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  legacyCode: text("legacy_code").notNull().unique(),
  name: text("name").notNull(),
  section: text("section"),
  yieldQty: numeric("yield_qty", { precision: 14, scale: 4, mode: "number" }),
  yieldUnit: text("yield_unit"),
  isArchived: boolean("is_archived").notNull().default(false),
  sellingPrice: money("selling_price"),
  targetFoodCostPct: numeric("target_food_cost_pct", { precision: 5, scale: 2, mode: "number" }),
  cookBookText: text("cook_book_text"),
  photoUrl: text("photo_url"),
  branches: text("branches").array().notNull().default(sql`'{}'::text[]`), // empty = all branches, same convention as stock_items.branches
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subRecipes = pgTable("sub_recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  legacyCode: text("legacy_code").notNull().unique(),
  stockItemId: uuid("stock_item_id").notNull().unique().references(() => stockItems.id),
  name: text("name").notNull(),
  section: text("section"),
  yieldQty: numeric("yield_qty", { precision: 14, scale: 4, mode: "number" }),
  yieldUnit: text("yield_unit"),
  isArchived: boolean("is_archived").notNull().default(false),
  cookBookText: text("cook_book_text"),
  photoUrl: text("photo_url"),
  // Matches Supy's Stockable/Non-Stockable distinction: a stockable
  // sub-recipe needs an explicit production event to replenish it; a
  // non-stockable one has its ingredients depleted directly wherever it's
  // used instead. All sub-recipes migrated from the source data are
  // stockable (each already has its own stock_items row) — this flag is
  // forward-compatible for a future non-stockable sub-recipe, not a
  // behavior change for existing data.
  stockable: boolean("stockable").notNull().default(true),
  // Drive the Production module's auto-computed expiry (produced date +
  // shelf life) and the printed "Receipt of Production" label — only
  // meaningful for stockable sub-recipes, same as index.html's rd-shelf-life
  // / rd-storage-instr fields.
  shelfLifeDays: integer("shelf_life_days"),
  storageInstructions: text("storage_instructions"),
  branches: text("branches").array().notNull().default(sql`'{}'::text[]`), // empty = all branches, same convention as stock_items.branches
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mainRecipeId: uuid("main_recipe_id").references(() => mainRecipes.id, { onDelete: "cascade" }),
    subRecipeId: uuid("sub_recipe_id").references(() => subRecipes.id, { onDelete: "cascade" }),
    stockItemId: uuid("stock_item_id").references(() => stockItems.id),
    // The ingredient itself is a finished main recipe (e.g. a "Brunch Combo"
    // built from two other dishes) rather than a stock item. Only valid when
    // the parent row is a main recipe too — a sub-recipe's ingredients must
    // be real consumable stock, since Production actually depletes them.
    ingredientMainRecipeId: uuid("ingredient_main_recipe_id").references(() => mainRecipes.id),
    lineNo: integer("line_no").notNull(),
    unitLabel: text("unit_label"),
    // qty is always the wastage-inflated "Qty to Buy" — the canonical
    // costed quantity (matches index.html's persisted `q`, computed as
    // initWt / (1 - lossPct/100)). wastagePct is stored purely so the
    // ingredient editor can redisplay "Qty Needed" on a later edit instead
    // of losing that context; it never itself enters the cost math.
    qty: numeric("qty", { precision: 14, scale: 6, mode: "number" }).notNull(),
    wastagePct: numeric("wastage_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    rateAtBuild: money("rate_at_build"),
    amountAtBuild: money("amount_at_build"),
    ingredientWeightG: numeric("ingredient_weight_g", { precision: 14, scale: 4, mode: "number" }),
    lastPrice: money("last_price"),
  },
  (t) => [
    check(
      "recipe_ingredients_exactly_one_parent",
      sql`(case when ${t.mainRecipeId} is null then 0 else 1 end) + (case when ${t.subRecipeId} is null then 0 else 1 end) = 1`
    ),
    check(
      "recipe_ingredients_exactly_one_ingredient",
      sql`(case when ${t.stockItemId} is null then 0 else 1 end) + (case when ${t.ingredientMainRecipeId} is null then 0 else 1 end) = 1`
    ),
  ]
);

/* ============================================================
   Transactional: Purchase Orders / GRN / price history
   ============================================================ */
export const poNumberSeq = pgSequence("po_number_seq", { startWith: 1, minValue: 1 });
export const grnNumberSeq = pgSequence("grn_number_seq", { startWith: 1, minValue: 1 });
export const batchNumberSeq = pgSequence("batch_number_seq", { startWith: 1, minValue: 1 });
export const lotNumberSeq = pgSequence("lot_number_seq", { startWith: 1, minValue: 1 });

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poNumber: text("po_number").notNull().unique(),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    status: text("status").notNull().default("DRAFT"),
    deliverTo: text("deliver_to"),
    notes: text("notes"),
    taxRateDefault: numeric("tax_rate_default", { precision: 5, scale: 2, mode: "number" }).notNull().default(5),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdDate: date("created_date").notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "purchase_orders_status_check",
      sql`${t.status} in ('DRAFT','APPROVED','ORDERED','PARTIALLY RECEIVED','FULLY RECEIVED','CANCELLED')`
    ),
  ]
);

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  unitLabel: text("unit_label"),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }).notNull(),
  rate: money("rate").notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(5),
  packagingVariantId: uuid("packaging_variant_id").references(() => productSupplierPackaging.id),
});

export const grns = pgTable(
  "grns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grnNumber: text("grn_number").notNull().unique(),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id), // null = Direct GRN
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    receivedDate: date("received_date").notNull(),
    invoiceNumber: text("invoice_number"),
    invoiceDueDate: date("invoice_due_date"),
    // What kind of document the supplier actually issued for this receipt —
    // shown alongside invoiceNumber so a Delivery Note (goods now, invoice
    // later) isn't mistaken for a Tax Invoice (billable now) in AP review.
    documentType: text("document_type"),
    attachmentUrl: text("attachment_url"),
    status: text("status").notNull().default("DRAFT"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => profiles.id),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // AP payment tracking for GRNs that carry a real billable document
    // (documentType = TAX_INVOICE) — lets a posted receipt double as the
    // invoice record itself instead of needing a separate AP entry.
    paymentStatus: text("payment_status").notNull().default("OUTSTANDING"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => profiles.id),
  },
  (t) => [
    check("grns_status_check", sql`${t.status} in ('DRAFT','POSTED')`),
    check("grns_document_type_check", sql`${t.documentType} is null or ${t.documentType} in ('TAX_INVOICE','DELIVERY_NOTE')`),
    check("grns_payment_status_check", sql`${t.paymentStatus} in ('OUTSTANDING','PAID')`),
  ]
);

export const grnLines = pgTable(
  "grn_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grnId: uuid("grn_id").notNull().references(() => grns.id, { onDelete: "cascade" }),
    purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLines.id),
    stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
    unitLabel: text("unit_label"),
    orderedQty: numeric("ordered_qty", { precision: 14, scale: 4, mode: "number" }),
    receivedQty: numeric("received_qty", { precision: 14, scale: 4, mode: "number" }).notNull(),
    rate: money("rate").notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(5),
    isFoc: boolean("is_foc").notNull().default(false),
    batchNo: text("batch_no"),
    lotNo: text("lot_no"),
    mfgDate: date("mfg_date"),
    expiryDate: date("expiry_date"),
    expiryExtensionCount: integer("expiry_extension_count").notNull().default(0),
    expiryTicketPrintedAt: timestamp("expiry_ticket_printed_at", { withTimezone: true }),
    condition: text("condition").notNull().default("ACCEPTED"),
    lineAmount: money("line_amount").notNull(),
  },
  (t) => [
    check("grn_lines_condition_check", sql`${t.condition} in ('ACCEPTED','DAMAGED','REJECTED')`),
    check("grn_lines_expiry_extension_count_check", sql`${t.expiryExtensionCount} >= 0 and ${t.expiryExtensionCount} <= 2`),
  ]
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
    oldRate: money("old_rate"),
    newRate: money("new_rate"),
    reason: text("reason"),
    changedBy: uuid("changed_by").references(() => profiles.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("manual"),
  },
  (t) => [check("price_history_source_check", sql`${t.source} in ('manual','grn','bulk')`)]
);

/* ============================================================
   Credit Notes — a lightweight "request credit/return from supplier" flag
   tied to a posted GRN (damaged/rejected goods, short delivery, etc.). No
   stock or financial side effects — purely a paper trail the supplier is
   chased against, same scope as index.html's version.
   ============================================================ */
export const creditNoteNumberSeq = pgSequence("credit_note_number_seq", { startWith: 1, minValue: 1 });

export const creditNotes = pgTable(
  "credit_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creditNoteNumber: text("credit_note_number").notNull().unique(),
    grnId: uuid("grn_id").notNull().references(() => grns.id),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    amount: money("amount").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("REQUESTED"),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("credit_notes_status_check", sql`${t.status} in ('REQUESTED','ISSUED','REJECTED')`)]
);

/* ============================================================
   Supplier Returns — unlike Credit Notes (a paper/money claim only), this
   actually moves stock back out the door. Single-step, no status lifecycle
   (same as customer_returns on the CK sales side): the act of recording the
   return IS the act of removing the stock, in one transaction. A correction
   is a new GRN, not an un-return. Independent of Credit Notes — a return can
   optionally also get a credit note requested against the same GRN, but
   neither implies the other.
   ============================================================ */
export const supplierReturnNumberSeq = pgSequence("supplier_return_number_seq", { startWith: 1, minValue: 1 });

export const supplierReturns = pgTable("supplier_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  grnId: uuid("grn_id").notNull().references(() => grns.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  reason: text("reason"),
  value: money("value").notNull().default(0),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supplierReturnLines = pgTable("supplier_return_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierReturnId: uuid("supplier_return_id").notNull().references(() => supplierReturns.id, { onDelete: "cascade" }),
  grnLineId: uuid("grn_line_id").notNull().references(() => grnLines.id),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }).notNull(), // purchase-unit basis, same as grn_lines.received_qty
  unitLabel: text("unit_label"),
  rate: money("rate").notNull(),
  amount: money("amount").notNull(),
});

/* ============================================================
   Consolidated Invoices — groups several POSTED GRNs from the same supplier
   (each GRN usable in at most one consolidated invoice) into a single AP
   record, for suppliers who bill once for multiple deliveries.
   ============================================================ */
export const consolidatedInvoiceNumberSeq = pgSequence("consolidated_invoice_number_seq", { startWith: 1, minValue: 1 });

export const consolidatedInvoices = pgTable("consolidated_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  invoiceDate: date("invoice_date").notNull(),
  total: money("total").notNull().default(0),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consolidatedInvoiceGrns = pgTable(
  "consolidated_invoice_grns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consolidatedInvoiceId: uuid("consolidated_invoice_id").notNull().references(() => consolidatedInvoices.id, { onDelete: "cascade" }),
    grnId: uuid("grn_id").notNull().references(() => grns.id),
  },
  (t) => [unique("consolidated_invoice_grns_grn_unique").on(t.grnId)]
);

/* ============================================================
   Stock ledger — the real on-hand quantity system. Every quantity-affecting
   event (GRN receipt, production consumption/output, wastage, transfer,
   stock count adjustment) writes an append-only stock_movements row; a
   parallel stock_balances table holds the current on-hand qty per
   stock_item+branch so reads don't need to sum the whole ledger. Same
   ledger-plus-live-snapshot pattern as price_history/stock_items.purchase_rate.

   Canonical quantity basis: same KG/LTR-or-piece normalization the recipe
   costing engine already uses (see src/server/costing/recipeCost.ts) — a
   weight/volume item's qty here is always KG/LTR-equivalent, never a raw
   purchase-pack quantity. This is what lets recipe_ingredients.qty (already
   in that basis) subtract directly from a balance with no unit conversion
   at production time; only GRN receiving needs to convert (purchase unit ->
   canonical) via src/lib/stockUnits.ts.
   ============================================================ */
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  qtyDelta: numeric("qty_delta", { precision: 14, scale: 4, mode: "number" }).notNull(), // canonical basis; +in / -out
  unitLabel: text("unit_label"), // display-only label (e.g. "KG", "L", "PC") at time of movement
  movementType: text("movement_type").notNull(),
  refType: text("ref_type"), // 'grn' | 'production_batch' | 'wastage' | 'transfer' | 'stock_count' — loose, not FK-enforced (polymorphic source)
  refId: uuid("ref_id"),
  balanceAfter: numeric("balance_after", { precision: 14, scale: 4, mode: "number" }),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check(
    "stock_movements_type_check",
    sql`${t.movementType} in ('GRN_RECEIPT','PRODUCTION_CONSUME','PRODUCTION_OUTPUT','WASTAGE','TRANSFER_OUT','TRANSFER_IN','STOCK_COUNT_ADJUSTMENT','CK_SALE','CUSTOMER_RETURN','SUPPLIER_RETURN')`
  ),
]);

export const stockBalances = pgTable("stock_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  qtyOnHand: numeric("qty_on_hand", { precision: 14, scale: 4, mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("stock_balances_item_branch_unique").on(t.stockItemId, t.branchId)]);

/* ============================================================
   Production — converts raw stock into a produced sub-recipe item. Consumes
   the sub-recipe's ingredients (scaled by a batch multiplier) from stock and
   adds the yielded quantity of the produced item back, both via stock_movements.
   ============================================================ */
export const productionBatchNumberSeq = pgSequence("production_batch_number_seq", { startWith: 1, minValue: 1 });

export const productionBatches = pgTable(
  "production_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchNo: text("batch_no").notNull().unique(),
    lotNo: text("lot_no").notNull(),
    subRecipeId: uuid("sub_recipe_id").notNull().references(() => subRecipes.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    scaleMultiplier: numeric("scale_multiplier", { precision: 10, scale: 4, mode: "number" }).notNull().default(1),
    yieldQty: numeric("yield_qty", { precision: 14, scale: 4, mode: "number" }).notNull(), // canonical basis
    yieldUnit: text("yield_unit"),
    totalCost: money("total_cost").notNull(),
    costPerUnit: money("cost_per_unit"),
    producedDate: date("produced_date").notNull(),
    expiryDate: date("expiry_date"),
    expiryExtensionCount: integer("expiry_extension_count").notNull().default(0),
    expiryTicketPrintedAt: timestamp("expiry_ticket_printed_at", { withTimezone: true }),
    // 'OPEN' — a ticket exists, staff is actively producing under this
    // lot/batch (e.g. vacuum-sealing many packs), stock not yet moved, can
    // print as many copies of the batch/lot label as needed. 'CLOSED' — the
    // run is finished: ingredient stock consumed, finished-item stock
    // credited, locked from further edits. Renamed from DRAFT/POSTED to
    // match the real physical workflow (was previously named after the
    // record's edit-lock state, not what the staff is actually doing).
    status: text("status").notNull().default("OPEN"),
    notes: text("notes"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => profiles.id),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("production_batches_status_check", sql`${t.status} in ('OPEN','CLOSED')`),
    check("production_batches_expiry_extension_count_check", sql`${t.expiryExtensionCount} >= 0 and ${t.expiryExtensionCount} <= 2`),
  ]
);

export const productionBatchIngredients = pgTable("production_batch_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  productionBatchId: uuid("production_batch_id").notNull().references(() => productionBatches.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }).notNull(), // canonical basis, already scaled
  unitLabel: text("unit_label"),
  rateAtProduction: money("rate_at_production"),
  amountAtProduction: money("amount_at_production"),
});

/* ============================================================
   Wastage Tracking
   ============================================================ */
export const wastageEventNumberSeq = pgSequence("wastage_event_number_seq", { startWith: 1, minValue: 1 });

export const wastageEvents = pgTable(
  "wastage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wastageNo: text("wastage_no").notNull().unique(),
    eventDate: date("event_date").notNull(),
    costCenter: text("cost_center").notNull(),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    staffName: text("staff_name"),
    status: text("status").notNull().default("DRAFT"),
    totalCost: money("total_cost").notNull().default(0),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => profiles.id),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("wastage_events_status_check", sql`${t.status} in ('DRAFT','POSTED')`)]
);

export const wastageLines = pgTable("wastage_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  wastageEventId: uuid("wastage_event_id").notNull().references(() => wastageEvents.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }).notNull(), // canonical basis
  unitLabel: text("unit_label"),
  reason: text("reason").notNull(),
  notes: text("notes"),
  rateAtWaste: money("rate_at_waste"),
  amountAtWaste: money("amount_at_waste"),
  photoUrl: text("photo_url"),
});

/* ============================================================
   Stock Transfers (inter-branch)
   ============================================================ */
export const transferNumberSeq = pgSequence("transfer_number_seq", { startWith: 1, minValue: 1 });

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferNo: text("transfer_no").notNull().unique(),
    fromBranchId: uuid("from_branch_id").notNull().references(() => branches.id),
    toBranchId: uuid("to_branch_id").notNull().references(() => branches.id),
    transferDate: date("transfer_date").notNull(),
    staffName: text("staff_name"),
    // DRAFT -> IN_TRANSIT (send: deducts source branch only) -> POSTED
    // (receive: credits destination branch only) — a real two-sided
    // confirming step, unlike every other DRAFT->POSTED module in this app
    // where both stock sides settle atomically in one action. POSTED keeps
    // its existing terminal meaning ("fully settled"); IN_TRANSIT is new.
    status: text("status").notNull().default("DRAFT"),
    totalCost: money("total_cost").notNull().default(0),
    notes: text("notes"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentBy: uuid("sent_by").references(() => profiles.id),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => profiles.id),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("stock_transfers_status_check", sql`${t.status} in ('DRAFT','IN_TRANSIT','POSTED')`),
    check("stock_transfers_branch_check", sql`${t.fromBranchId} <> ${t.toBranchId}`),
  ]
);

export const stockTransferLines = pgTable("stock_transfer_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  stockTransferId: uuid("stock_transfer_id").notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }).notNull(), // canonical basis
  unitLabel: text("unit_label"),
  rateAtTransfer: money("rate_at_transfer"),
  amountAtTransfer: money("amount_at_transfer"),
});

/* ============================================================
   Stock Count
   ============================================================ */
export const stockCountNumberSeq = pgSequence("stock_count_number_seq", { startWith: 1, minValue: 1 });

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countNo: text("count_no").notNull().unique(),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    costCenter: text("cost_center"),
    countDate: date("count_date").notNull(),
    staffName: text("staff_name"),
    status: text("status").notNull().default("DRAFT"),
    totalVarianceValue: money("total_variance_value").notNull().default(0),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: uuid("posted_by").references(() => profiles.id),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("stock_counts_status_check", sql`${t.status} in ('DRAFT','POSTED')`)]
);

// systemQty/countedQty snapshot the live balance and the counted amount at
// the moment the line was added/submitted; variance is derived (counted -
// system), never stored, so there's nothing to keep in sync on edit.
export const stockCountLines = pgTable("stock_count_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  stockCountId: uuid("stock_count_id").notNull().references(() => stockCounts.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  systemQty: numeric("system_qty", { precision: 14, scale: 4, mode: "number" }).notNull(),
  countedQty: numeric("counted_qty", { precision: 14, scale: 4, mode: "number" }),
  unitLabel: text("unit_label"),
  rateAtCount: money("rate_at_count"),
});

// A reusable checklist of items for a cost center's recurring counts — just
// the item roster, never quantities. System qty is always re-fetched live
// from stock_balances whenever a template is loaded into a new count.
export const stockCountTemplates = pgTable("stock_count_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  costCenter: text("cost_center"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockCountTemplateItems = pgTable("stock_count_template_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull().references(() => stockCountTemplates.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
});

/* ============================================================
   Material Requests — an approval paper trail between locations, not a
   stock-moving transaction itself (matches index.html: fulfillment is
   recorded here but never calls into the stock ledger; the actual physical
   move happens as its own GRN/Transfer). fromLocation/toLocation are free
   text rather than a branches FK because index.html's MR_LOCATIONS mixes
   real branches (NAMAYOSO, THG) with cost centers (Kitchen, Bar, Central
   Warehouse) — there's no single table that already models that list.
   ============================================================ */
export const mrNumberSeq = pgSequence("mr_number_seq", { startWith: 1, minValue: 1 });

export const materialRequests = pgTable(
  "material_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mrNumber: text("mr_number").notNull().unique(),
    fromLocation: text("from_location").notNull(),
    toLocation: text("to_location").notNull(),
    requiredDate: date("required_date").notNull(),
    status: text("status").notNull().default("PENDING APPROVAL"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => profiles.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [check("material_requests_status_check", sql`${t.status} in ('PENDING APPROVAL','APPROVED','REJECTED','FULFILLED')`)]
);

export const materialRequestLines = pgTable("material_request_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  materialRequestId: uuid("material_request_id").notNull().references(() => materialRequests.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }).notNull(),
  unitLabel: text("unit_label"),
});

/* ============================================================
   CK Sales — customers, price lists, delivery notes/invoices, and
   returns. Selling out of Central Kitchen/Warehouse to branches or
   external customers; unlike the other ledger-writing modules there's no
   DRAFT state here (matches index.html: "Create & Deduct Stock" is the only
   save action), so a delivery note is posted the moment it's created.
   ============================================================ */
export const priceLists = pgTable(
  "price_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    mode: text("mode").notNull().default("cost"),
    marginPct: numeric("margin_pct", { precision: 7, scale: 2, mode: "number" }),
  },
  (t) => [check("price_lists_mode_check", sql`${t.mode} in ('cost','margin')`)]
);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  group: text("group").notNull().default("General"),
  priceListId: uuid("price_list_id").references(() => priceLists.id),
  email: text("email"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dnNumberSeq = pgSequence("dn_number_seq", { startWith: 1, minValue: 1 });
export const proNumberSeq = pgSequence("pro_number_seq", { startWith: 1, minValue: 1 });
export const returnNumberSeq = pgSequence("return_number_seq", { startWith: 1, minValue: 1 });

export const deliveryNotes = pgTable(
  "delivery_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    docType: text("doc_type").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    deliveryDate: date("delivery_date").notNull(),
    total: money("total").notNull().default(0),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("delivery_notes_doc_type_check", sql`${t.docType} in ('DN','PRO')`)]
);

export const deliveryNoteLines = pgTable("delivery_note_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryNoteId: uuid("delivery_note_id").notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }).notNull(), // canonical basis
  unitLabel: text("unit_label"),
  price: money("price").notNull(),
  amount: money("amount").notNull(),
});

export const customerReturns = pgTable("customer_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  deliveryNoteId: uuid("delivery_note_id").notNull().references(() => deliveryNotes.id),
  reason: text("reason"),
  value: money("value").notNull().default(0),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerReturnLines = pgTable("customer_return_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerReturnId: uuid("customer_return_id").notNull().references(() => customerReturns.id, { onDelete: "cascade" }),
  deliveryNoteLineId: uuid("delivery_note_line_id").notNull().references(() => deliveryNoteLines.id),
  stockItemId: uuid("stock_item_id").notNull().references(() => stockItems.id),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }).notNull(),
  unitLabel: text("unit_label"),
  price: money("price").notNull(),
  amount: money("amount").notNull(),
});

/* ============================================================
   Historical read-only ledger (imported once from the seed data)
   ============================================================ */
export const invoicesHistorical = pgTable(
  "invoices_historical",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceDate: date("invoice_date"),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    invoiceNumber: text("invoice_number"),
    net: money("net"),
    vat: money("vat"),
    total: money("total"),
    terms: text("terms"),
    termsNormalized: text("terms_normalized"),
    weekLabel: text("week_label"),
    status: text("status"),
  },
  (t) => [check("invoices_historical_status_check", sql`${t.status} in ('OUTSTANDING','PAID','OTHER')`)]
);

export const purchaseLinesHistorical = pgTable("purchase_lines_historical", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").references(() => invoicesHistorical.id),
  purchaseDate: date("purchase_date"),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  itemLabel: text("item_label"),
  unitLabel: text("unit_label"),
  qty: numeric("qty", { precision: 14, scale: 4, mode: "number" }),
  rate: money("rate"),
  amount: money("amount"),
  section: text("section"),
  category: text("category"),
});

export const dailySalesHistorical = pgTable("daily_sales_historical", {
  id: uuid("id").primaryKey().defaultRandom(),
  salesDate: date("sales_date").notNull().unique(),
  amount: money("amount").notNull(),
});

// Per-recipe POS sales — unlike daily_sales_historical (aggregate revenue
// only, one-time migration data), this is a real ongoing table populated by
// CSV import so Recipe Sales Report / Menu Engineering have a qty-sold
// signal per dish, not just total revenue. itemLabel keeps the raw label
// from the export even once matched, so a re-import or a mismatch can be
// audited; mainRecipeId is null until/unless matched to a real recipe.
export const recipeSales = pgTable(
  "recipe_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleDate: date("sale_date").notNull(),
    mainRecipeId: uuid("main_recipe_id").references(() => mainRecipes.id),
    itemLabel: text("item_label").notNull(),
    qty: numeric("qty", { precision: 14, scale: 2, mode: "number" }).notNull(),
    revenue: money("revenue").notNull(),
    // "csv" (manual upload) or a POS provider key ("foodics"). sourceOrderId
    // is the POS's own order/line id, only set for POS-synced rows — lets a
    // repeated sync of the same date range be idempotent (onConflictDoNothing
    // on source+sourceOrderId) instead of double-counting revenue. Multiple
    // null sourceOrderId rows (every CSV import) never collide with each
    // other under Postgres's unique-constraint NULL semantics.
    source: text("source").notNull().default("csv"),
    sourceOrderId: text("source_order_id"),
    importedBy: uuid("imported_by").references(() => profiles.id),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("recipe_sales_source_order_unique").on(t.source, t.sourceOrderId)]
);

// One row per POS provider, holding the credential the user enters through
// the Integrations settings page (not an env var — unlike WhatsApp/Anthropic,
// this genuinely needs to be self-service editable by a business owner
// without a server redeploy). lastSyncStatus/lastSyncAt drive the "last
// synced X ago, N orders" line on that page.
export const posIntegrations = pgTable("pos_integrations", {
  id: text("id").primaryKey(), // provider key, e.g. "foodics" — one row per provider
  apiToken: text("api_token"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
