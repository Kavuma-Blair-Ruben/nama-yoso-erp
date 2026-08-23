import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";

export async function renderPdfBuffer(doc: Parameters<typeof renderToBuffer>[0]): Promise<Buffer> {
  return renderToBuffer(doc);
}
