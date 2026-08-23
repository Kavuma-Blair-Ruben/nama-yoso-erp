export function Stars({ stars }: { stars: number | null }) {
  if (stars == null) return <span style={{ color: "var(--ink-faint)", fontSize: 11.5 }}>Not yet rated</span>;
  return (
    <span style={{ color: "var(--accent)", letterSpacing: 1 }}>
      {"★".repeat(stars)}
      <span style={{ color: "var(--line)" }}>{"☆".repeat(5 - stars)}</span>
    </span>
  );
}
