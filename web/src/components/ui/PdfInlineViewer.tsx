"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a PDF's pages to <canvas> elements using PDF.js, entirely in JS —
 * this sidesteps the browser's native PDF handling altogether. Embedding via
 * <iframe>/<object>/<embed> renders blank in browsers set to "download PDFs"
 * instead of viewing them (a per-browser setting the app can't override), so
 * that's not a reliable way to guarantee an inline view; canvas rendering is.
 */
export function PdfInlineViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const doc = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.3 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.marginBottom = "8px";
          canvas.style.maxWidth = "100%";
          canvas.style.height = "auto";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (cancelled) return;
          containerRef.current?.appendChild(canvas);
        }
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (status === "error") {
    return (
      <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
        Couldn&apos;t render a preview of this file — <a href={url} target="_blank" rel="noreferrer">open it in a new tab</a> instead.
      </div>
    );
  }

  return (
    <div>
      {status === "loading" && <div style={{ fontSize: 12, color: "var(--ink-faint)", marginBottom: 8 }}>Loading preview…</div>}
      <div
        ref={containerRef}
        style={{ maxHeight: 480, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8, background: "#fff", maxWidth: 600 }}
      />
    </div>
  );
}
