"use client";

import { useState, useTransition } from "react";
import {
  createCategory,
  renameCategory,
  deleteCategory,
  createSubcategory,
  renameSubcategory,
  deleteSubcategory,
} from "@/server/actions/settings";

type Subcategory = { id: string; name: string; itemCount: number };
type Category = { id: string; name: string; itemCount: number; subcategories: Subcategory[] };

export function CategorySettings({ categories }: { categories: Category[] }) {
  const [pending, startTransition] = useTransition();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Categories &amp; Subcategories</h3>
      </div>
      <div className="panel-body">
        {categories.map((c) => (
          <div key={c.id} style={{ marginBottom: 14 }}>
            <div className="usedin-item">
              <span className="name">
                <b>{c.name}</b> <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>({c.itemCount} items)</span>
              </span>
              <span className="code">
                {c.itemCount === 0 && (
                  <a
                    href="#"
                    style={{ color: "var(--bad)" }}
                    onClick={(e) => {
                      e.preventDefault();
                      startTransition(() => deleteCategory(c.id));
                    }}
                  >
                    remove
                  </a>
                )}
              </span>
            </div>
            <div style={{ paddingLeft: 16 }}>
              {c.subcategories.map((s) => (
                <div className="usedin-item" key={s.id} style={{ padding: "4px 0" }}>
                  <span className="name" style={{ fontSize: 12.5 }}>
                    {s.name} <span style={{ color: "var(--ink-faint)" }}>({s.itemCount})</span>
                  </span>
                  <span className="code">
                    {s.itemCount === 0 && (
                      <a
                        href="#"
                        style={{ color: "var(--bad)" }}
                        onClick={(e) => {
                          e.preventDefault();
                          startTransition(() => deleteSubcategory(s.id));
                        }}
                      >
                        remove
                      </a>
                    )}
                  </span>
                </div>
              ))}
              <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto", padding: "6px 0" }}>
                <input
                  type="text"
                  placeholder="Add subcategory..."
                  value={newSubName[c.id] ?? ""}
                  onChange={(e) => setNewSubName((m) => ({ ...m, [c.id]: e.target.value }))}
                />
                <button
                  className="btn ghost"
                  disabled={pending}
                  onClick={() => {
                    const val = newSubName[c.id]?.trim();
                    if (!val) return;
                    startTransition(async () => {
                      await createSubcategory(c.id, val);
                    });
                    setNewSubName((m) => ({ ...m, [c.id]: "" }));
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        ))}
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto", marginTop: 10 }}>
          <input type="text" placeholder="e.g. Cleaning Supplies" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
          <button
            className="btn accent"
            disabled={pending}
            onClick={() => {
              const val = newCategoryName.trim();
              if (!val) return;
              startTransition(async () => {
                await createCategory(val);
              });
              setNewCategoryName("");
            }}
          >
            Add Category
          </button>
        </div>
      </div>
    </div>
  );
}
