"use client";

import { useEffect, useState } from "react";

export function NavGroup({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const storageKey = `nav-group-collapsed:${id}`;
  const [open, setOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpen(localStorage.getItem(storageKey) !== "1");
    setHydrated(true);
  }, [storageKey]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      localStorage.setItem(storageKey, next ? "0" : "1");
      return next;
    });
  }

  return (
    <div>
      <button type="button" className="nav-group-toggle" onClick={toggle} aria-expanded={open}>
        <span className="nav-label" style={{ padding: 0 }}>{label}</span>
        <span className="nav-caret">{open ? "▾" : "▸"}</span>
      </button>
      {/* Render children even before hydration (open=true default) so there's no flash of empty nav on first paint. */}
      {(open || !hydrated) && <div>{children}</div>}
    </div>
  );
}
