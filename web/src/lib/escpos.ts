import "server-only";

// Minimal ESC/POS command builder — the command language nearly every
// thermal receipt printer speaks over a raw port-9100 socket (Epson,
// Star, Xprinter, generic Chinese clones, etc.). Just enough to prove a
// device actually prints, not a general-purpose ESC/POS library.
const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]); // ESC @  — reset to defaults
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]); // ESC a 1
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]); // ESC a 0
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]); // ESC E 1
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]); // ESC E 0
const DOUBLE_HEIGHT_ON = Buffer.from([GS, 0x21, 0x01]); // GS ! 1
const NORMAL_SIZE = Buffer.from([GS, 0x21, 0x00]); // GS ! 0
const FEED_AND_CUT = Buffer.from([0x0a, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x00]); // feed 4 lines, GS V 0 (full cut)

function text(s: string): Buffer {
  return Buffer.from(s + "\n", "ascii");
}

// GS h n / GS w n / GS H n — barcode height (dots), module width, and
// human-readable-text position (2 = printed below the bars). Standard
// across Epson-compatible ESC/POS printers, set once before GS k.
const BARCODE_HEIGHT = Buffer.from([GS, 0x68, 80]);
const BARCODE_WIDTH = Buffer.from([GS, 0x77, 2]);
const BARCODE_HRI_BELOW = Buffer.from([GS, 0x48, 0x02]);

// GS k 73 n {B<data> — CODE128 via the explicit-length form (function 73),
// the most broadly portable CODE128 encoding across Epson/Star/generic
// clones. "{B" selects Code Set B (full printable ASCII), which is what
// every barcode already printed elsewhere in this app (jsbarcode-rendered
// product/lot labels) uses.
const GS_K_HEADER = Buffer.from([GS, 0x6b, 73]);
function code128(data: string): Buffer {
  const payload = Buffer.from(`{B${data}`, "ascii");
  return Buffer.concat([GS_K_HEADER, Buffer.from([payload.length]), payload]);
}

export type ExpiryTicketData = {
  name: string;
  code: string;
  batchNo: string | null;
  lotNo: string | null;
  expiryDate: string;
  daysLeft: number;
  reference: string;
};

// Same content as the browser print-only expiry alert ticket
// (ExpiryTicketAutoPrint.tsx), rendered for a raw ESC/POS receipt printer
// instead of the OS print dialog — for kitchens with a dedicated network
// receipt printer wired to auto-print alerts, no browser tab needed.
export function buildExpiryTicketEscPos(item: ExpiryTicketData): Buffer {
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    DOUBLE_HEIGHT_ON,
    BOLD_ON,
    text("*** EXPIRED ***"),
    text("CHECK & REMOVE"),
    NORMAL_SIZE,
    BOLD_OFF,
    text(item.reference),
    text("--------------------------------"),
    ALIGN_LEFT,
    BOLD_ON,
    text(item.name),
    BOLD_OFF,
    text(item.code),
    text(`Batch: ${item.batchNo ?? "-"}`),
    text(`Lot: ${item.lotNo ?? "-"}`),
    text(`Expiry Date: ${item.expiryDate}`),
    text(`Expired: ${Math.abs(item.daysLeft)}d ago`),
    text("--------------------------------"),
    ALIGN_CENTER,
    text("Pull from stock and confirm"),
    text("disposal or wastage entry."),
    FEED_AND_CUT,
  ]);
}

// Proves CODE128 barcode printing actually works on real hardware, not
// just plain text — this is the open question before wiring GRN/product
// label printing through a registered Device instead of the browser print
// dialog (see the label sheets' CODE128 usage via jsbarcode). Uses a fixed
// sample code so it can be scanned back and compared against what was sent.
export function buildBarcodeTestTicket(deviceName: string): Buffer {
  const sampleCode = "NY-TEST-00128";
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    text("BARCODE TEST"),
    BOLD_OFF,
    text(`Device: ${deviceName}`),
    text("--------------------------------"),
    BARCODE_HEIGHT,
    BARCODE_WIDTH,
    BARCODE_HRI_BELOW,
    code128(sampleCode),
    text("--------------------------------"),
    text("Scan the code above — it should"),
    text(`read back exactly: ${sampleCode}`),
    FEED_AND_CUT,
  ]);
}

export type WastageTicketData = {
  wastageNo: string;
  eventDate: string;
  costCenter: string;
  staffName: string | null;
  lines: { name: string; qty: number; unitLabel: string; reason: string; amount: number }[];
  totalCost: number;
};

// A real printed record of what got wasted and why, the moment a wastage
// event posts — this document didn't exist anywhere in the app before
// (wastage was data-entry only, nothing to hand a manager or stick on a
// bin), auto-sent through whichever device the branch has routed for
// 'wastage_ticket' (see print_routes / printRouting.ts).
export function buildWastageTicketEscPos(data: WastageTicketData): Buffer {
  const lineRows = data.lines.flatMap((l) => [
    text(l.name),
    text(`  ${l.qty} ${l.unitLabel} - ${l.reason}`),
  ]);
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    DOUBLE_HEIGHT_ON,
    BOLD_ON,
    text("WASTAGE / SCRAP"),
    NORMAL_SIZE,
    BOLD_OFF,
    text(data.wastageNo),
    text("--------------------------------"),
    ALIGN_LEFT,
    text(`Date: ${data.eventDate}`),
    text(`Sector: ${data.costCenter}`),
    ...(data.staffName ? [text(`Staff: ${data.staffName}`)] : []),
    text("--------------------------------"),
    ...lineRows,
    text("--------------------------------"),
    BOLD_ON,
    text(`Total Cost: ${data.totalCost.toFixed(2)}`),
    BOLD_OFF,
    FEED_AND_CUT,
  ]);
}

export type ProductionLabelData = {
  batchNo: string;
  lotNo: string;
  subRecipeName: string;
  yieldQty: number;
  yieldUnit: string;
  producedDate: string;
  expiryDate: string | null;
};

// Same content as the browser-print "Receipt of Production" ticket
// (ProductionLabelSheet.tsx), for a real network/PrintNode receipt printer
// instead of the OS print dialog — includes a real CODE128 of the lot
// number so it stays scannable for traceability (see /lots/[lotNo]).
export function buildProductionLabelEscPos(data: ProductionLabelData): Buffer {
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    text("PRODUCTION"),
    BOLD_OFF,
    text(data.batchNo),
    text("--------------------------------"),
    ALIGN_LEFT,
    BOLD_ON,
    text(data.subRecipeName),
    BOLD_OFF,
    text(`Yield: ${data.yieldQty} ${data.yieldUnit}`),
    text(`Produced: ${data.producedDate}`),
    ...(data.expiryDate ? [text(`Expiry: ${data.expiryDate}`)] : []),
    text("--------------------------------"),
    ALIGN_CENTER,
    BARCODE_HEIGHT,
    BARCODE_WIDTH,
    BARCODE_HRI_BELOW,
    code128(data.lotNo),
    FEED_AND_CUT,
  ]);
}

export type ProductionLabelCopyData = ProductionLabelData & {
  scaleMultiplier: number;
  staffName: string | null;
  storageInstructions: string | null;
  branchName: string | null;
};

// Richer variant of buildProductionLabelEscPos, for the manual "Print
// Batch/Lot Labels" re-print button specifically — matches the fuller
// content of the original browser-print label (ProductionLabelSheet.tsx's
// ProductionReceipt), which the plain auto-print ticket above deliberately
// doesn't carry. No native QR command in this minimal ESC/POS
// implementation, so this keeps the CODE128 barcode (already the scan
// target /lots/[lotNo] traceability uses elsewhere) rather than adding one
// — content parity over exact visual parity.
export function buildProductionLabelCopyEscPos(data: ProductionLabelCopyData): Buffer {
  const perBatchQty = data.scaleMultiplier ? data.yieldQty / data.scaleMultiplier : data.yieldQty;
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    text("RECEIPT OF PRODUCTION"),
    BOLD_OFF,
    text(data.producedDate),
    text("--------------------------------"),
    ALIGN_LEFT,
    BOLD_ON,
    text(data.subRecipeName),
    BOLD_OFF,
    text(`Batch size: ${perBatchQty.toFixed(2)} ${data.yieldUnit}/batch`),
    text(`Batches produced: ${data.scaleMultiplier.toFixed(2)}`),
    text(`Total yield: ${data.yieldQty.toFixed(2)} ${data.yieldUnit}`),
    text(`Lot #: ${data.lotNo}`),
    ...(data.expiryDate ? [text(`Expiry: ${data.expiryDate}`)] : []),
    text(`Staff: ${data.staffName ?? "-"}`),
    text(`Storage: ${data.storageInstructions ?? "-"}`),
    text("--------------------------------"),
    ALIGN_CENTER,
    BARCODE_HEIGHT,
    BARCODE_WIDTH,
    BARCODE_HRI_BELOW,
    code128(data.lotNo),
    text(`Made in ${(data.branchName ?? "NAMAYOSO MIRDIFF").toUpperCase()}`),
    FEED_AND_CUT,
  ]);
}

export type GrnLabelData = {
  itemName: string;
  itemCode: string;
  batchNo: string | null;
  lotNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
};

// One label per GRN line — same content as the browser-print lot label
// sheet (LotLabelSheet.tsx), for a real network/PrintNode printer instead
// of the OS print dialog. Barcodes the lot number (falls back to the item
// code if a line has no lot number) since that's what /lots/[lotNo]
// traceability lookup scans against.
export function buildGrnLabelEscPos(data: GrnLabelData): Buffer {
  const barcodeValue = data.lotNo || data.itemCode;
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    text(data.itemName),
    BOLD_OFF,
    text(data.itemCode),
    ...(data.batchNo ? [text(`Batch: ${data.batchNo}`)] : []),
    ...(data.mfgDate ? [text(`Mfg: ${data.mfgDate}`)] : []),
    ...(data.expiryDate ? [text(`Exp: ${data.expiryDate}`)] : []),
    text("--------------------------------"),
    BARCODE_HEIGHT,
    BARCODE_WIDTH,
    BARCODE_HRI_BELOW,
    code128(barcodeValue),
    FEED_AND_CUT,
  ]);
}

export type ProductLabelData = {
  itemName: string;
  itemCode: string;
  rate: number | null;
  rateUnit: string | null;
};

// Same content as the browser-print product barcode sheet (LabelSheet.tsx),
// for a real network/PrintNode printer instead of the OS print dialog.
// Barcodes the item's own legacy code — what every scan-to-add flow in this
// app (stock count, production picker, etc.) already matches against.
export function buildProductLabelEscPos(data: ProductLabelData): Buffer {
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    text(data.itemName),
    BOLD_OFF,
    text(data.itemCode),
    ...(data.rate != null ? [text(`${data.rate.toFixed(2)}${data.rateUnit ? ` / ${data.rateUnit}` : ""}`)] : []),
    text("--------------------------------"),
    BARCODE_HEIGHT,
    BARCODE_WIDTH,
    BARCODE_HRI_BELOW,
    code128(data.itemCode),
    FEED_AND_CUT,
  ]);
}

export function buildTestPrintTicket(deviceName: string): Buffer {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    DOUBLE_HEIGHT_ON,
    BOLD_ON,
    text("NAMA YOSO"),
    NORMAL_SIZE,
    BOLD_OFF,
    text("TEST PRINT"),
    text("--------------------------------"),
    ALIGN_LEFT,
    text(`Device: ${deviceName}`),
    text(`Time: ${now}`),
    text("--------------------------------"),
    ALIGN_CENTER,
    text("If you can read this, the"),
    text("printer is talking to the app."),
    FEED_AND_CUT,
  ]);
}
