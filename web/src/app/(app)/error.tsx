"use client";

// Wraps every page under the authenticated app (Dashboard, Products, GRN,
// Recipes, Reports, everything) in one shared error boundary. Before this
// file existed, ANY unhandled error anywhere in ANY of those pages' render
// tree — e.g. a database statement-timeout under a degraded/slow database —
// crashed the whole page with the browser's raw "This page couldn't load"
// screen instead of something a user could recover from. Now it degrades to
// a plain, on-brand "try again" message instead. Does not cover the (app)
// layout itself (its own critical calls — session check, notifications —
// are already individually guarded), so see also the root error.tsx.
export default function AppSegmentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center", gap: 12, padding: 24 }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2 style={{ margin: 0 }}>Something went wrong loading this page.</h2>
      <p style={{ color: "var(--muted, #667)", maxWidth: 480, margin: 0 }}>
        This is usually a temporary hiccup — often a slow or overloaded database — not something wrong with your data. Give it a moment and try again.
      </p>
      <button className="btn accent" type="button" onClick={() => retry()} style={{ marginTop: 8 }}>
        Try again
      </button>
      {error.digest && (
        <p style={{ color: "var(--muted, #99a)", fontSize: 12, marginTop: 8 }}>Error reference: {error.digest}</p>
      )}
    </div>
  );
}
