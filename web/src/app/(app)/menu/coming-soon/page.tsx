import { requireSection } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";

const LABELS: Record<string, string> = {
  modifiers: "Modifiers",
  combos: "Combos",
  groups: "Groups",
};

export default async function MenuComingSoonPage({ searchParams }: PageProps<"/menu/coming-soon">) {
  await requireSection("recipes", "view");
  const sp = await searchParams;
  const feature = typeof sp.feature === "string" ? sp.feature : "";
  const label = LABELS[feature] ?? "This feature";

  return (
    <>
      <PageHeader title={label} subtitle="Not built yet." />
      <div className="callout">
        {label} is planned as a follow-up build — order-time menu customization (add-ons, bundled deals) isn&apos;t
        part of the app yet. Ask to have it built when you&apos;re ready.
      </div>
    </>
  );
}
