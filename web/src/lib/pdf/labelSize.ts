// Shared by both label PDF builders (product barcode labels, GRN lot
// labels) so a PrintNode job's page size always matches whichever roll size
// the browser print dropdown already offers (LabelSheet.tsx / LotLabelSheet.tsx)
// — same physical label stock, same @page size, just rendered server-side.
const PT_PER_MM = 72 / 25.4;

export const LABEL_SIZES_MM = {
  "50x30": { w: 50, h: 30 },
  "40x30": { w: 40, h: 30 },
  "62x29": { w: 62, h: 29 }, // Brother DK-11209-size cut off a 62mm continuous roll
  "50x40": { w: 50, h: 40 },
  "62x40": { w: 62, h: 40 }, // 62mm continuous roll, taller cut for GRN lot labels
  "4x6": { w: 101.6, h: 152.4 },
} as const;

export type LabelSizeKey = keyof typeof LABEL_SIZES_MM;

export function labelPageSizePt(key: LabelSizeKey): [number, number] {
  const { w, h } = LABEL_SIZES_MM[key];
  return [w * PT_PER_MM, h * PT_PER_MM];
}
