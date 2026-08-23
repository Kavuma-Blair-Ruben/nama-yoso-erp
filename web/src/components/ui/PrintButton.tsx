"use client";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button className="btn accent no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
