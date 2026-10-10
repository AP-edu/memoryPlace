"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Footprints, Hammer } from "lucide-react";
import { TEMPLATES, templatePlan, templateStats, type PalaceTemplate } from "@/lib/templates";
import PlanThumb from "@/components/palaces/PlanThumb";

/** POST the template, then open the new palace. Shared by the gallery and the explore walk. */
export function useBuildTemplate() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function build(t: PalaceTemplate) {
    if (busy) return;
    setBusy(t.id);
    setError(null);
    try {
      const res = await fetch("/api/palaces/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: t.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not build it");
      router.push(`/palaces/${body.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build it");
      setBusy(null);
    }
  }
  return { build, busy, error };
}

/**
 * Famous places to walk and to start a palace from. Signed in: "Build it"
 * copies the place into your palaces. Signed out: walking is open to all,
 * building asks you to sign up.
 */
export default function TemplateGallery({ compact = false }: { compact?: boolean }) {
  const { status } = useSession();
  const { build, busy, error } = useBuildTemplate();
  const cards = useMemo(() => TEMPLATES.map((t) => ({ t, plan: templatePlan(t), stats: templateStats(t) })), []);
  return (
    <div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <ul className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {cards.map(({ t, plan, stats }) => (
          <li key={t.id} className="card-base flex flex-col overflow-hidden !p-0">
            <Link href={`/explore/${t.id}`} className="block bg-muted/40 p-4" aria-label={`Walk ${t.name}`} tabIndex={-1}>
              {plan && <PlanThumb plan={plan} className={compact ? "h-28 w-full" : "h-36 w-full"} />}
            </Link>
            <div className="flex flex-1 flex-col p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-highlight">
                {t.place} · {t.era}
              </p>
              <h3 className="mt-1 text-lg font-semibold leading-snug">{t.name}</h3>
              {!compact && <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {stats.rooms} rooms · {stats.loci} loci ready for cards
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <Link href={`/explore/${t.id}`} className="btn-outline !px-3 !py-1.5 text-sm">
                  <Footprints className="h-4 w-4" aria-hidden /> Walk it
                </Link>
                {status === "authenticated" ? (
                  <button type="button" onClick={() => build(t)} disabled={!!busy} className="btn-primary !px-3 !py-1.5 text-sm">
                    <Hammer className="h-4 w-4" aria-hidden /> {busy === t.id ? "Building..." : "Build it"}
                  </button>
                ) : (
                  <Link href="/signup" className="btn-primary !px-3 !py-1.5 text-sm">
                    Make it yours
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
