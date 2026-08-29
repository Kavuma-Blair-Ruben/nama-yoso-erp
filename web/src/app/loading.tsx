export default function RootLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
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
