"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ItemSearchOption = { value: string; code: string; label: string; sublabel?: string };

// A type-to-filter replacement for a plain <select> — built for pickers
// with too many options to scroll through comfortably (773 products, ~130
// recipes). Matches on code or label, case-insensitive substring. Reuses
// the .autocomplete-* classes already defined in globals.css but never
// wired up to any component until now.
//
// The dropdown is portaled to document.body with fixed positioning rather
// than rendered inline with position:absolute — every call site so far
// (POBuilder, ProductionBuilder) nests this inside an overflow:auto/hidden
// scroll container (.line-builder, .panel), which silently clips an
// absolutely-positioned child to that container's box. Confirmed live: the
// dropdown existed in the DOM with a correct computed position but was
// entirely invisible until this fix.
export function ItemSearchSelect({
  options,
  value,
  onChange,
  placeholder = "Search by code or name…",
  disabled = false,
}: {
  options: ItemSearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = useState(selected ? `${selected.code} — ${selected.label}` : "");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the displayed text in sync if the selection changes from outside
  // (e.g. a parent resetting a line after it's added to the cart).
  useEffect(() => {
    const s = options.find((o) => o.value === value);
    setQuery(s ? `${s.code} — ${s.label}` : "");
  }, [value, options]);

  useEffect(() => {
    if (!open) return;
    function updateRect() {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom, left: r.left, width: r.width });
    }
    updateRect();
    // capture:true — the scrollable ancestor (.line-builder/.panel-body)
    // doesn't bubble its own scroll event to window, only the capture phase
    // sees it.
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Reverting on blur-without-selecting is deliberate — an
        // abandoned partial search string must never look like a real
        // selection, and must never silently clear a real one either.
        const s = options.find((o) => o.value === value);
        setQuery(s ? `${s.code} — ${s.label}` : "");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [value, options]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q === (selected ? `${selected.code} — ${selected.label}`.toLowerCase() : "")) return options.slice(0, 50);
    return options.filter((o) => o.code.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)).slice(0, 50);
  }, [query, options, selected]);

  return (
    <div className="autocomplete-wrap" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {!disabled &&
        open &&
        matches.length > 0 &&
        rect &&
        createPortal(
          <div className="autocomplete-list" style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, marginTop: 2 }}>
            {matches.map((o) => (
              <div
                key={o.value}
                className="autocomplete-item"
                onMouseDown={(e) => {
                  // mousedown, not click — fires before the input's blur
                  // handler fires, so the selection wins instead of the
                  // click-outside revert. stopPropagation too — this element
                  // isn't a DOM descendant of rootRef once portaled, so the
                  // document-level "outside click" listener would otherwise
                  // treat this exact click as outside and revert first.
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(o.value);
                  setQuery(`${o.code} — ${o.label}`);
                  setOpen(false);
                }}
              >
                <span className="c">{o.code}</span> {o.label}
                {o.sublabel && <span style={{ color: "var(--ink-faint)" }}> · {o.sublabel}</span>}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
