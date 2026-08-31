"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ItemSearchOption = { value: string; code: string; label: string; sublabel?: string };

// A type-to-filter replacement for a plain <select> — built for pickers
// with too many options to scroll through comfortably (773 products, ~130
// recipes). Matches on code or label, case-insensitive substring. Reuses
// the .autocomplete-* classes already defined in globals.css but never
// wired up to any component until now.
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
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the displayed text in sync if the selection changes from outside
  // (e.g. a parent resetting a line after it's added to the cart).
  useEffect(() => {
    const s = options.find((o) => o.value === value);
    setQuery(s ? `${s.code} — ${s.label}` : "");
  }, [value, options]);

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
      {!disabled && open && matches.length > 0 && (
        <div className="autocomplete-list">
          {matches.map((o) => (
            <div
              key={o.value}
              className="autocomplete-item"
              onMouseDown={(e) => {
                // mousedown, not click — fires before the input's blur
                // handler above, so the selection wins instead of the
                // click-outside revert.
                e.preventDefault();
                onChange(o.value);
                setQuery(`${o.code} — ${o.label}`);
                setOpen(false);
              }}
            >
              <span className="c">{o.code}</span> {o.label}
              {o.sublabel && <span style={{ color: "var(--ink-faint)" }}> · {o.sublabel}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
