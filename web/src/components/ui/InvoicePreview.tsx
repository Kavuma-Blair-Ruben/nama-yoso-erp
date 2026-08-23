import { PdfInlineViewer } from "./PdfInlineViewer";

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(url);
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url);
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split("/").pop() || "invoice";
  } catch {
    return "invoice";
  }
}

export function InvoicePreview({ url }: { url: string }) {
  const image = isImageUrl(url);
  const pdf = isPdfUrl(url);
  const filename = filenameFromUrl(url);
  const viewHref = `/api/view?url=${encodeURIComponent(url)}`;
  const downloadHref = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <span className="tag good">✓ Invoice on file</span>
        <a href={viewHref} target="_blank" rel="noreferrer" className="btn ghost" style={{ padding: "4px 10px", fontSize: 11.5 }}>
          Open full size
        </a>
        <a href={downloadHref} className="btn ghost" style={{ padding: "4px 10px", fontSize: 11.5 }}>
          ⬇ Download
        </a>
      </div>
      {image ? (
        <a href={viewHref} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Supplier invoice" style={{ maxWidth: 360, maxHeight: 480, borderRadius: 8, border: "1px solid var(--line)", display: "block", background: "#fff" }} />
        </a>
      ) : pdf ? (
        <PdfInlineViewer url={viewHref} />
      ) : (
        <a
          href={viewHref}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            maxWidth: 360,
            padding: "14px 16px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "#fff",
            textDecoration: "none",
          }}
        >
          <span style={{ fontSize: 28 }}>📎</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filename}</span>
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Click to open in a new tab</span>
          </span>
        </a>
      )}
    </div>
  );
}
