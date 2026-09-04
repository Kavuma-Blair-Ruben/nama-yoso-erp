import "server-only";
import bwipjs from "bwip-js/node";
import QRCode from "qrcode";
import { renderPdfBuffer } from "@/lib/pdf/render";
import { LotLabelPdf } from "@/lib/pdf/LotLabelPdf";
import type { LabelSizeKey } from "@/lib/pdf/labelSize";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export type LotLabelData = {
  itemName: string;
  itemCode: string;
  batchNo: string | null;
  lotNo: string | null;
  expiryDate: string | null;
  receivedQty: number;
  unitLabel: string | null;
  condition: string;
};

// Same rationale as buildProductLabelPdf — a real PDF for driver-based label
// printers (Brother QL-800 via PrintNode), since GRN lot labels also barcode
// the lot number for /lots/[lotNo] traceability scanning.
export async function buildLotLabelPdf(data: LotLabelData, sizeKey: LabelSizeKey): Promise<Buffer> {
  const barcodeValue = data.lotNo || data.itemCode;
  const barcodePng = await bwipjs.toBuffer({ bcid: "code128", text: barcodeValue, scale: 3, height: 8, includetext: false });
  const qrDataUri = data.lotNo
    ? await QRCode.toDataURL(`${SITE_URL}/lots/${encodeURIComponent(data.lotNo)}`, { margin: 0, width: 200 })
    : await QRCode.toDataURL(`${SITE_URL}/products/${data.itemCode}`, { margin: 0, width: 200 });
  return renderPdfBuffer(
    LotLabelPdf({
      data: {
        itemName: data.itemName,
        itemCode: data.itemCode,
        batchNo: data.batchNo,
        lotNo: data.lotNo,
        expiryDate: data.expiryDate,
        receivedQty: data.receivedQty,
        unitLabel: data.unitLabel,
        condition: data.condition,
        barcodeDataUri: `data:image/png;base64,${barcodePng.toString("base64")}`,
        qrDataUri,
        sizeKey,
      },
    })
  );
}
