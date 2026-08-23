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
