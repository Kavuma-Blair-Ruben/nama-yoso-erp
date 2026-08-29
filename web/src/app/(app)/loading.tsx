// Next.js shows this INSTANTLY the moment navigation starts, automatically,
// for every page under (app) — no wiring needed per-page. Without this file,
// a slow page load was a blank white screen with zero feedback, which is
// indistinguishable from "broken" even when it's genuinely just working.
// The persistent chrome (sidebar, topbar) stays visible the whole time —
// only this content area swaps in while the page's own data is loading.
export default function AppLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        gap: 14,
        color: "var(--muted, #667)",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "3px solid var(--border, #e2e2e2)",
          borderTopColor: "var(--accent, #0a5a96)",
          animation: "nama-spin 0.8s linear infinite",
        }}
      />
      <span>Loading…</span>
      <style>{`
        @keyframes nama-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
