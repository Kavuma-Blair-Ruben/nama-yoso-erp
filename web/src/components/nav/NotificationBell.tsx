"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Notification } from "@/server/db/queries/notifications";
import { fetchNotifications } from "@/server/actions/notifications";

const SEVERITY_COLOR: Record<Notification["severity"], string> = { critical: "var(--bad)", warning: "var(--chart-5)", info: "var(--accent)" };
const SEVERITY_BG: Record<Notification["severity"], string> = { critical: "var(--bad-soft)", warning: "#fbf0d9", info: "var(--accent-soft)" };

const ALERTS_PREF_KEY = "namayoso.desktopAlertsEnabled";
const POLL_MS = 45000;

// Toast lives here rather than as a fully separate component — it's driven
// by the exact same poll loop/dedup logic as the desktop Notification() calls
// below, and both need to agree on "which ids are actually new" from one
// single source of truth per tick.
type Toast = Notification & { toastId: number };

export function NotificationBell({ notifications: initialNotifications }: { notifications: Notification[] }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const toastCounter = useRef(0);
  const criticalCount = notifications.filter((n) => n.severity === "critical").length;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Desktop alert preference persists per-browser (not per-account — this
  // is a "does this device want OS pop-ups" setting, same spirit as a
  // notification-sound toggle), and only actually pops anything if the
  // browser's own permission is separately granted.
  useEffect(() => {
    try {
      setAlertsEnabled(localStorage.getItem(ALERTS_PREF_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted");
    } catch {
      // Private-browsing/blocked storage — desktop alerts just stay off.
    }
  }, []);

  async function enableDesktopAlerts() {
    if (typeof Notification === "undefined") return;
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") {
      setAlertsEnabled(true);
      try {
        localStorage.setItem(ALERTS_PREF_KEY, "1");
      } catch {
        // Ignore — the toggle still works for this tab session even if it
        // can't be remembered for next time.
      }
    }
  }

  // Poll while the tab is open — no service worker, so this can't reach the
  // user when the app isn't open anywhere, but it's what actually delivers
  // a pop-up (desktop Notification, or the in-page toast as a fallback that
  // works with zero permission) for anything that shows up after first load,
  // e.g. a new limit override request landing while you're already in the app.
  useEffect(() => {
    seenIdsRef.current = new Set(initialNotifications.map((n) => n.id));
    const interval = setInterval(async () => {
      let next: Notification[];
      try {
        next = await fetchNotifications();
      } catch {
        return;
      }
      const seen = seenIdsRef.current!;
      const freshlyArrived = next.filter((n) => !seen.has(n.id));
      seenIdsRef.current = new Set(next.map((n) => n.id));
      setNotifications(next);

      if (freshlyArrived.length === 0) return;
      for (const n of freshlyArrived) {
        if (alertsEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(n.title, { body: n.message, tag: n.id });
        }
      }
      setToasts((ts) => [...ts, ...freshlyArrived.map((n) => ({ ...n, toastId: ++toastCounter.current }))]);
    }, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertsEnabled]);

  function dismissToast(toastId: number) {
    setToasts((ts) => ts.filter((t) => t.toastId !== toastId));
  }

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => dismissToast(t.toastId), 8000));
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  return (
    <>
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
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Notifications</span>
              {!alertsEnabled && (
                <button
                  type="button"
                  onClick={enableDesktopAlerts}
                  style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", padding: 0 }}
                >
                  Enable desktop alerts
                </button>
              )}
            </div>
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

      {toasts.length > 0 && (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "flex", flexDirection: "column", gap: 8, width: 320, maxWidth: "90vw" }}>
          {toasts.map((t) => (
            <Link
              key={t.toastId}
              href={t.href}
              onClick={() => dismissToast(t.toastId)}
              style={{
                display: "block",
                padding: "12px 14px",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
                background: "var(--bg-panel)",
                border: `1px solid ${SEVERITY_COLOR[t.severity]}`,
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: SEVERITY_COLOR[t.severity], flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 12.5 }}>{t.title}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dismissToast(t.toastId);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)", fontSize: 13, padding: 0, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.4 }}>{t.message}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
