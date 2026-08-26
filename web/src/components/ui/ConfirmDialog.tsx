"use client";

// A real in-app dialog instead of window.confirm() — the native dialog is
// silently swallowed with no error in some real browser contexts (embedded
// webviews, some mobile browsers), so a destructive button wired to it can
// just do nothing when clicked. Reuses the .overlay class already defined
// in globals.css.
export function ConfirmDialog({
  open,
  title,
  body,
  error,
  pending,
  confirmLabel,
  pendingLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  error?: string | null;
  pending: boolean;
  confirmLabel: string;
  pendingLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="overlay open" onClick={() => !pending && onCancel()}>
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(380px,92vw)",
          background: "var(--bg-card)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)",
          padding: 22,
          zIndex: 42,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontFamily: "var(--display)", fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 12.8, color: "var(--ink-soft)", marginBottom: 16, lineHeight: 1.5 }}>{body}</div>
        {error && <div className="login-error" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" style={{ background: "var(--bad)" }} disabled={pending} onClick={onConfirm}>
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
