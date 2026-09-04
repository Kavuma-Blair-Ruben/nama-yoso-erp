import "server-only";
import bwipjs from "bwip-js/node";
import QRCode from "qrcode";
import { renderPdfBuffer } from "@/lib/pdf/render";
import { ProductLabelPdf } from "@/lib/pdf/ProductLabelPdf";
import type { LabelSizeKey } from "@/lib/pdf/labelSize";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export type ProductLabelData = { itemName: string; itemCode: string; rate: number | null; rateUnit: string | null };

// Renders the same barcode + QR + name/code/price content as the browser
// print sheet (LabelSheet.tsx), but as an actual PDF a PrintNode "pdf_base64"
// job can hand to the receiving computer's real OS driver — the only way a
// Brother QL-800 (or any driver-based label printer) renders correctly,
// since it doesn't understand raw ESC/POS commands like a receipt printer does.
export async function buildProductLabelPdf(data: ProductLabelData, sizeKey: LabelSizeKey): Promise<Buffer> {
  const barcodePng = await bwipjs.toBuffer({ bcid: "code128", text: data.itemCode, scale: 3, height: 8, includetext: false });
  const qrDataUri = await QRCode.toDataURL(`${SITE_URL}/products/${data.itemCode}`, { margin: 0, width: 200 });
  return renderPdfBuffer(
    ProductLabelPdf({
      data: {
        itemName: data.itemName,
        itemCode: data.itemCode,
        rate: data.rate,
        rateUnit: data.rateUnit,
        barcodeDataUri: `data:image/png;base64,${barcodePng.toString("base64")}`,
        qrDataUri,
        sizeKey,
      },
    })
  );
}
