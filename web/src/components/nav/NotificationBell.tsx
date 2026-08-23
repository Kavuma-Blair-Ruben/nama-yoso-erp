"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Notification } from "@/server/db/queries/notifications";

const SEVERITY_COLOR: Record<Notification["severity"], string> = { critical: "var(--bad)", warning: "var(--chart-5)", info: "var(--accent)" };
const SEVERITY_BG: Record<Notification["severity"], string> = { critical: "var(--bad-soft)", warning: "#fbf0d9", info: "var(--accent-soft)" };

export function NotificationBell({ notifications }: { notifications: Notification[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const criticalCount = notifications.filter((n) => n.severity === "critical").length;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          padding: 6,
          borderRadius: 8,
          color: "var(--ink)",
        }}
      >
        🔔
        {notifications.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 15,
              height: 15,
              borderRadius: 8,
              background: criticalCount > 0 ? "var(--bad)" : "var(--accent)",
              color: "#fff",
              fontSize: 9.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--bg-panel)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 50,
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 700, fontSize: 13 }}>Notifications</div>
          {notifications.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: "var(--ink-faint)" }}>Nothing needs your attention right now.</div>
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                onClick={() => setOpen(false)}
                style={{ display: "block", padding: "10px 14px", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "inherit", background: SEVERITY_BG[n.severity] }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: SEVERITY_COLOR[n.severity], flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 12.5 }}>{n.title}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.4 }}>{n.message}</div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
