import Link from "next/link";

export function PageHeader({ title, subtitle, action, backHref, backLabel }: { title: string; subtitle: string; action?: React.ReactNode; backHref?: string; backLabel?: string }) {
  return (
    <div className="page-head">
      <div>
        {backHref && (
          <Link href={backHref} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 6 }}>
            ← {backLabel ?? "Back"}
          </Link>
        )}
        <h1>{title}</h1>
        <div className="sub">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}
