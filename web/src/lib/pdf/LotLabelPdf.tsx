import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { fmt } from "@/lib/format";
import type { LabelSizeKey } from "./labelSize";
import { labelPageSizePt } from "./labelSize";

const s = StyleSheet.create({
  page: { padding: 4, fontFamily: "Helvetica", color: "#111" },
  name: { fontSize: 8, fontWeight: 700, textAlign: "center" },
  code: { fontSize: 6.5, color: "#555", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 2 },
  barcode: { height: 20, flexGrow: 1 },
  qr: { width: 20, height: 20 },
  line: { fontSize: 6.5, textAlign: "center", marginTop: 1 },
  lineBold: { fontSize: 6.5, fontWeight: 700, textAlign: "center", marginTop: 1 },
});

export type LotLabelPdfData = {
  itemName: string;
  itemCode: string;
  batchNo: string | null;
  lotNo: string | null;
  expiryDate: string | null;
  receivedQty: number;
  unitLabel: string | null;
  condition: string;
  barcodeDataUri: string;
  qrDataUri: string;
  sizeKey: LabelSizeKey;
};

export function LotLabelPdf({ data }: { data: LotLabelPdfData }) {
  return (
    <Document>
      <Page size={labelPageSizePt(data.sizeKey)} style={s.page}>
        <Text style={s.name}>{data.itemName}</Text>
        <Text style={s.code}>{data.itemCode}</Text>
        <View style={s.row}>
          <Image src={data.barcodeDataUri} style={s.barcode} />
          <Image src={data.qrDataUri} style={s.qr} />
        </View>
        <Text style={s.line}>Batch {data.batchNo ?? "-"} · Lot {data.lotNo ?? "-"}</Text>
        <Text style={s.lineBold}>Exp: {data.expiryDate ?? "N/A"}</Text>
        <Text style={s.line}>{fmt(data.receivedQty, 2)} {data.unitLabel ?? ""} · {data.condition}</Text>
      </Page>
    </Document>
  );
}
