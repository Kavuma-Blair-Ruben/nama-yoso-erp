import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { money } from "@/lib/format";
import type { LabelSizeKey } from "./labelSize";
import { labelPageSizePt } from "./labelSize";

const s = StyleSheet.create({
  page: { padding: 4, fontFamily: "Helvetica", color: "#111" },
  name: { fontSize: 8, fontWeight: 700, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 2 },
  barcode: { height: 22, flexGrow: 1 },
  qr: { width: 22, height: 22 },
  code: { fontSize: 6.5, color: "#555", textAlign: "center", marginTop: 1 },
  price: { fontSize: 8, fontWeight: 700, textAlign: "center", marginTop: 1 },
});

export type ProductLabelPdfData = {
  itemName: string;
  itemCode: string;
  rate: number | null;
  rateUnit: string | null;
  barcodeDataUri: string;
  qrDataUri: string;
  sizeKey: LabelSizeKey;
};

export function ProductLabelPdf({ data }: { data: ProductLabelPdfData }) {
  return (
    <Document>
      <Page size={labelPageSizePt(data.sizeKey)} style={s.page}>
        <Text style={s.name}>{data.itemName}</Text>
        <View style={s.row}>
          <Image src={data.barcodeDataUri} style={s.barcode} />
          <Image src={data.qrDataUri} style={s.qr} />
        </View>
        <Text style={s.code}>{data.itemCode}{data.rateUnit ? ` · ${data.rateUnit}` : ""}</Text>
        {data.rate != null && <Text style={s.price}>{money(data.rate, 2)}</Text>}
      </Page>
    </Document>
  );
}
