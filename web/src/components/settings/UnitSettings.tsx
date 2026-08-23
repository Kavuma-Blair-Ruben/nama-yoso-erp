"use client";

import { useState, useTransition } from "react";
import { createUnit, updateUnit, deleteUnit, type UnitInput } from "@/server/actions/settings";
import { fmt, num } from "@/lib/format";

type Unit = { id: string; code: string; name: string; type: string; factor: number; inUseCount: number };
// factor is a raw string while editing — see num() in @/lib/format for why.
type FormState = { name: string; type: UnitInput["type"]; factor: string };

const BASE_LABEL: Record<string, string> = { weight: "grams", volume: "millilitres", count: "pieces" };
const DEFAULT_CODES = new Set(["u_g", "u_kg", "u_ml", "u_l", "u_pc"]);

function emptyForm(): FormState {
  return { name: "", type: "weight", factor: "1" };
}

export function UnitSettings({ units }: { units: Unit[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  function startCreate() {
    setEditId(null);
    setForm(emptyForm());
    setError(null);
  }
  function startEdit(u: Unit) {
    setEditId(u.id);
    setForm({ name: u.name, type: u.type as UnitInput["type"], factor: String(u.factor) });
    setError(null);
  }
  function cancel() {
    setEditId(null);
    setForm(null);
    setError(null);
  }
  function save() {
    if (!form) return;
    setError(null);
    const payload: UnitInput = { name: form.name, type: form.type, factor: num(form.factor) };
    startTransition(async () => {
      const result = editId ? await updateUnit(editId, payload) : await createUnit(payload);
      if (result?.error) setError(result.error);
      else {
        setForm(null);
        setEditId(null);
      }
    });
  }

  return (
    <>
      <div className="callout">
        Units defined here are usable for every product of the same type (weight, volume, or count) — anywhere a quantity is entered,
        including the Recipe Builder, not just the item&apos;s original base unit.
      </div>

      {form ? (
        <div className="panel" style={{ border: "2px solid var(--accent)", marginBottom: 16, maxWidth: 600 }}>
          <div className="panel-head"><h3>{editId ? "Edit Unit" : "New Unit"}</h3></div>
          <div className="panel-body">
            <div className="form-row">
              <label>Unit name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Box of 12, Bunch, Punnet, Case-5kg" />
            </div>
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>Type</div>
              <div>Equals how many base units?</div>
            </div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 8 }}>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as UnitInput["type"] })}>
                <option value="weight">Weight (base: grams)</option>
                <option value="volume">Volume (base: millilitres)</option>
                <option value="count">Count (base: pieces)</option>
              </select>
              <input type="text" inputMode="decimal" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} placeholder="e.g. 5000 for a 5kg case" />
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 12 }}>
              e.g. &quot;Box of 12&quot; as a count unit = 12 (12 pieces per box). &quot;Case-5kg&quot; as a weight unit = 5000 (5000g per case).
            </div>
            {error && <div className="login-error">{error}</div>}
            <div className="btn-row">
              <button className="btn accent" disabled={pending} onClick={save}>{editId ? "Save Changes" : "Add Unit"}</button>
              <button className="btn ghost" disabled={pending} onClick={cancel}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button className="btn accent" style={{ marginBottom: 16 }} onClick={startCreate}>+ New Unit</button>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Type</th>
                <th className="right">Conversion</th>
                <th className="right">Products (by type)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td><span className="tag neutral">{u.type}</span></td>
                  <td className="mono-r">1 = {fmt(u.factor, u.factor < 1 ? 3 : 0)} {BASE_LABEL[u.type]}</td>
                  <td className="mono-r">{u.inUseCount}</td>
                  <td className="right">
                    {DEFAULT_CODES.has(u.code) ? (
                      <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>standard unit</span>
                    ) : (
                      <>
                        <a href="#" style={{ marginRight: 8 }} onClick={(e) => { e.preventDefault(); startEdit(u); }}>edit</a>
                        <a
                          href="#"
                          style={{ color: "var(--bad)" }}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!confirm(`Delete unit "${u.name}"?`)) return;
                            startTransition(async () => {
                              await deleteUnit(u.id);
                            });
                          }}
                        >
                          delete
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
