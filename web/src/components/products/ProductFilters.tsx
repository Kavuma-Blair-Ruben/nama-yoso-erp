"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export function ProductFilters({
  categories,
  subcategories,
  suppliers,
  storageTypes,
}: {
  categories: string[];
  subcategories: string[];
  suppliers: string[];
  storageTypes: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="filterbar">
      <input
        type="text"
        placeholder="Search product name or code..."
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => setParam("q", e.target.value)}
      />
      <select defaultValue={searchParams.get("cat") ?? ""} onChange={(e) => setParam("cat", e.target.value)}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select defaultValue={searchParams.get("sub") ?? ""} onChange={(e) => setParam("sub", e.target.value)}>
        <option value="">All subcategories</option>
        {subcategories.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select defaultValue={searchParams.get("st") ?? ""} onChange={(e) => setParam("st", e.target.value)}>
        <option value="">All storage</option>
        {storageTypes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select defaultValue={searchParams.get("sup") ?? ""} onChange={(e) => setParam("sup", e.target.value)}>
        <option value="">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500 }}>
        <input
          type="checkbox"
          checked={searchParams.get("missingPrice") === "1"}
          onChange={(e) => setParam("missingPrice", e.target.checked ? "1" : "")}
        />
        Missing price only
      </label>
    </div>
  );
}
