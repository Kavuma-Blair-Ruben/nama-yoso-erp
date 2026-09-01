"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMenuCategory, renameMenuCategory, deleteMenuCategory } from "@/server/actions/menuCategories";

type MenuCategory = { id: string; name: string; sortOrder: number; recipeCount: number };

function CategoryRow({ category }: { category: MenuCategory }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await renameMenuCategory(category.id, name);
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteMenuCategory(category.id);
      router.refresh();
    });
  }

  return (
    <div className="usedin-item">
      {editing ? (
        <>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 220 }} />
          <span className="code">
            <a href="#" onClick={(e) => { e.preventDefault(); save(); }}>{pending ? "saving…" : "save"}</a>{" · "}
            <a href="#" onClick={(e) => { e.preventDefault(); setEditing(false); setName(category.name); }}>cancel</a>
          </span>
        </>
      ) : (
        <>
          <span className="name">
            <b>{category.name}</b> <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>({category.recipeCount} recipe{category.recipeCount === 1 ? "" : "s"})</span>
          </span>
          <span className="code">
            <a href="#" onClick={(e) => { e.preventDefault(); setEditing(true); }}>rename</a>
            {category.recipeCount === 0 && (
              <>
                {" · "}
                <a href="#" style={{ color: "var(--bad)" }} onClick={(e) => { e.preventDefault(); remove(); }}>remove</a>
              </>
            )}
          </span>
        </>
      )}
      {error && <div style={{ fontSize: 11, color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}

export function MenuCategorySettings({ categories, scope = "main" }: { categories: MenuCategory[]; scope?: "main" | "sub" }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isSub = scope === "sub";

  function add() {
    setError(null);
    const trimmed = newName.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createMenuCategory(trimmed, scope);
      if (result.error) setError(result.error);
      else {
        setNewName("");
        router.refresh();
      }
    });
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>{isSub ? "Sub-Recipe Categories" : "Menu Categories"}</h3></div>
      <div className="panel-body">
        <div className="callout">
          {isSub
            ? "These are the production lines/batches your sub-recipes are grouped into (Hot Line, Bar Production...) — separate from main-recipe menu sections. Sub-recipes pick from this list instead of typing a section freehand."
            : "These are your menu's sections (Breakfast, Mains, Desserts...) — separate from ingredient categories. Recipes pick from this list instead of typing a section freehand."}
        </div>
        {categories.length ? categories.map((c) => <CategoryRow key={c.id} category={c} />) : (
          <div style={{ fontSize: 12, color: "var(--ink-faint)", padding: "8px 0" }}>No {isSub ? "sub-recipe" : "menu"} categories yet — add one below.</div>
        )}
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr auto", marginTop: 10 }}>
          <input type="text" placeholder={isSub ? "e.g. hot-line-production" : "e.g. Breakfast"} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn accent" disabled={pending} onClick={add}>Add Category</button>
        </div>
        {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
