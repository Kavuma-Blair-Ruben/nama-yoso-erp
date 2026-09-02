"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

// One input works with two kinds of hardware:
//  - A handheld/USB barcode scanner gun — these act as a keyboard ("wedge"
//    mode), typing the decoded code followed by Enter into whatever's
//    focused. No special code needed beyond autofocus + submit-on-Enter.
//  - A device with just a camera (phone, tablet) — the "📷 Scan" button
//    opens a live decode loop via @zxing/browser, working with any barcode
//    or QR format it supports, across any browser with camera access
//    (unlike the native BarcodeDetector API, which is Chrome/Edge-only).
export function ScanInput({
  placeholder = "Scan or type a code, then Enter…",
  onScan,
  autoFocus = true,
}: {
  placeholder?: string;
  onScan: (code: string) => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    onScan(trimmed);
    setValue("");
  }

  useEffect(() => {
    if (!cameraOpen) return;
    setCameraError(null);
    let stopped = false;
    let controls: IScannerControls | null = null;

    import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      if (stopped || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      reader
        .decodeFromVideoDevice(undefined, videoRef.current, (result, _err, c) => {
          controls = c;
          controlsRef.current = c;
          if (result && !stopped) {
            stopped = true;
            c.stop();
            setCameraOpen(false);
            submit(result.getText());
          }
        })
        .catch((e: unknown) => setCameraError(e instanceof Error ? e.message : "Couldn't access the camera — check permissions."));
    });

    return () => {
      stopped = true;
      controls?.stop();
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit(value);
          }
        }}
        style={{ flex: 1 }}
      />
      <button type="button" className="btn ghost" onClick={() => setCameraOpen((v) => !v)}>
        {cameraOpen ? "✕ Close Camera" : "📷 Scan"}
      </button>

      {cameraOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setCameraOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-panel)", padding: 16, borderRadius: 10, width: "min(94vw, 900px)" }}>
            <video
              ref={videoRef}
              style={{ width: "100%", height: "min(80vh, 640px)", objectFit: "cover", background: "#000", borderRadius: 6, display: "block" }}
              muted
              playsInline
            />
            {cameraError ? (
              <div className="login-error" style={{ marginTop: 8 }}>{cameraError}</div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6 }}>Point the camera at a barcode or QR code.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
