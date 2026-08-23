"use client";

import { useRouter } from "next/navigation";

export function ReceiveAgainstPO({ eligible }: { eligible: { id: string; poNumber: string; supplier: string }[] }) {
  const router = useRouter();
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) router.push(`/grn/new?poId=${e.target.value}`);
      }}
    >
      <option value="">Receive against LPO...</option>
      {eligible.map((po) => (
        <option key={po.id} value={po.id}>
          {po.poNumber} — {po.supplier}
        </option>
      ))}
    </select>
  );
}
