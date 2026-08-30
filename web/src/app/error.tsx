"use client";

// Backstop above (app)/error.tsx — that one doesn't cover the (app) layout
// itself (its critical calls are individually guarded already, but this is
// defense-in-depth for anything else in there), and this one also covers
// /login and any other route outside the (app) group.
export default function RootSegmentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", textAlign: "center", gap: 12, padding: 24 }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2 style={{ margin: 0 }}>Something went wrong.</h2>
      <p style={{ color: "var(--muted, #667)", maxWidth: 480, margin: 0 }}>
        This is usually a temporary hiccup — often a slow or overloaded database — not something wrong with your data. Give it a moment and try again.
      </p>
      <button className="btn accent" type="button" onClick={() => retry()} style={{ marginTop: 8 }}>
        Try again
      </button>
    </div>
  );
}
