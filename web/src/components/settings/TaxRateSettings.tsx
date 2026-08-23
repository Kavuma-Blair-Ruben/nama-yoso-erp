"use client";

import { useState, useTransition } from "react";
import { createTaxRate, deleteTaxRate } from "@/server/actions/settings";
import { fmt } from "@/lib/format";

type TaxRate = { id: string; name: string; pct: number };

export function TaxRateSettings({ taxRates }: { taxRates: TaxRate[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [pct, setPct] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="panel">
      <div className="panel-head"><h3>Tax Rates</h3></div>
      <div className="panel-body">
        {taxRates.map((t) => (
          <div className="usedin-item" key={t.id}>
            <span className="name">{t.name}</span>
            <span className="code">
              {fmt(t.pct, 1)}%{" "}
              {taxRates.length > 1 && (
                <a
                  href="#"
                  style={{ color: "var(--bad)", marginLeft: 8 }}
                  onClick={(e) => {
                    e.preventDefault();
                    startTransition(async () => {
                      await deleteTaxRate(t.id);
                    });
                  }}
                >
                  remove
                </a>
              )}
            </span>
          </div>
        ))}
        <div className="line-builder-row" style={{ gridTemplateColumns: "1fr 90px auto", marginTop: 10 }}>
          <input type="text" placeholder="e.g. Reduced Rate" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="text" inputMode="decimal" placeholder="%" value={pct} onChange={(e) => setPct(e.target.value)} />
          <button
            className="btn accent"
            disabled={pending}
            onClick={() => {
              setError(null);
              const p = Number(pct);
              if (!name.trim() || Number.isNaN(p)) return setError("Enter a name and a valid percentage.");
              startTransition(async () => {
                const result = await createTaxRate(name, p);
                if (result?.error) setError(result.error);
                else {
                  setName("");
                  setPct("");
                }
              });
            }}
          >
            Add
          </button>
        </div>
        {error && <div className="login-error">{error}</div>}
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 8 }}>Used as suggestions wherever a tax rate is entered (POs, GRNs, item tax rate).</div>
      </div>
    </div>
  );
}
