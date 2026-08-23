"use client";

import { useState, useTransition } from "react";
import { createCustomer, createPriceList } from "@/server/actions/ckSales";
import { fmt } from "@/lib/format";

type PriceList = { id: string; name: string; mode: string; marginPct: number | null };
type Customer = { id: string; name: string; group: string; priceListId: string | null; priceListName: string | null; email: string | null; phone: string | null };

export function CustomerSettings({ customers, priceLists }: { customers: Customer[]; priceLists: PriceList[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("General");
  const [priceListId, setPriceListId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [showPriceListForm, setShowPriceListForm] = useState(false);
  const [plName, setPlName] = useState("");
  const [plMode, setPlMode] = useState<"cost" | "margin">("cost");
  const [plMargin, setPlMargin] = useState("");

  return (
    <>
      <div className="filterbar">
        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{customers.length} customer(s) · {priceLists.length} price list(s)</span>
        <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setShowPriceListForm((v) => !v)}>+ New Price List</button>
        <button className="btn accent" onClick={() => setShowCustomerForm((v) => !v)}>+ New Customer</button>
      </div>

      {error && <div className="login-error">{error}</div>}

      {showPriceListForm && (
        <div className="panel" style={{ border: "2px solid var(--accent)", marginBottom: 16, maxWidth: 560 }}>
          <div className="panel-head"><h3>New Price List</h3></div>
          <div className="panel-body">
            <div className="form-row"><label>Name</label><input type="text" value={plName} onChange={(e) => setPlName(e.target.value)} placeholder="e.g. THG Branch Pricing" /></div>
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}><div>Mode</div><div>Margin %</div></div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
              <select value={plMode} onChange={(e) => setPlMode(e.target.value as "cost" | "margin")}>
                <option value="cost">Cost price</option>
                <option value="margin">Cost + Margin</option>
              </select>
              <input type="text" inputMode="decimal" value={plMargin} disabled={plMode === "cost"} onChange={(e) => setPlMargin(e.target.value)} placeholder="e.g. 20" />
            </div>
            <div className="btn-row">
              <button
                className="btn accent"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await createPriceList(plName, plMode, plMode === "margin" ? Number(plMargin) || 0 : null);
                    if (result?.error) setError(result.error);
                    else {
                      setPlName("");
                      setPlMargin("");
                      setShowPriceListForm(false);
                    }
                  });
                }}
              >
                Save Price List
              </button>
              <button className="btn ghost" onClick={() => setShowPriceListForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showCustomerForm && (
        <div className="panel" style={{ border: "2px solid var(--accent)", marginBottom: 16, maxWidth: 600 }}>
          <div className="panel-head"><h3>New Customer</h3></div>
          <div className="panel-body">
            <div className="form-row"><label>Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. THG Branch, or an external client" /></div>
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}><div>Group</div><div>Price List</div></div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
              <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} />
              <select value={priceListId} onChange={(e) => setPriceListId(e.target.value)}>
                <option value="">Cost price (no markup)</option>
                {priceLists.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="line-builder-row head" style={{ gridTemplateColumns: "1fr 1fr" }}><div>Email</div><div>Phone</div></div>
            <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="btn-row">
              <button
                className="btn accent"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await createCustomer({ name, group, priceListId: priceListId || null, email: email || undefined, phone: phone || undefined });
                    if (result?.error) setError(result.error);
                    else {
                      setName("");
                      setEmail("");
                      setPhone("");
                      setShowCustomerForm(false);
                    }
                  });
                }}
              >
                Save Customer
              </button>
              <button className="btn ghost" onClick={() => setShowCustomerForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {priceLists.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head"><h3>Price Lists</h3></div>
          <div className="panel-body">
            {priceLists.map((p) => (
              <div className="usedin-item" key={p.id}>
                <span className="name">{p.name}</span>
                <span className="code">{p.mode === "margin" ? `Margin: ${fmt(p.marginPct, 1)}%` : "Cost price"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Group</th><th>Price List</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              {customers.length ? (
                customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td><span className="tag neutral">{c.group}</span></td>
                    <td>{c.priceListName ?? "Cost price"}</td>
                    <td>{c.email ?? "-"}</td>
                    <td>{c.phone ?? "-"}</td>
                  </tr>
                ))
              ) : (
                <tr className="empty-row"><td colSpan={5}>No customers added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
