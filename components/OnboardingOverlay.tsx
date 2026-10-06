"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ONBOARDING_STEPS, WALKED_STEP, onboardingProgress, type OnboardingFacts } from "@/lib/onboarding";

/**
 * Guided onboarding: a floating stepper that follows the learner through
 * build -> place 5 loci -> walk -> first session. Progress comes from real
 * data (see lib/onboarding.ts) and the finish/skip state lives on the user
 * row (users.onboarded_at), so it follows them across devices.
 */
export default function OnboardingOverlay({
  facts,
  firstPalaceId,
  firstRoomId,
  studyHref,
  onChanged,
}: {
  facts: OnboardingFacts;
  firstPalaceId: string | null;
  firstRoomId: string | null;
  studyHref: string | null;
  /** Called after server state changes so the page can refetch. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const progress = onboardingProgress(facts);
  const step = ONBOARDING_STEPS[progress.current];

  // Spotlight: ring the page element the current step points at.
  const spotlight = step?.id === "build" && !firstPalaceId ? '[data-tour="palace-form"]' : null;
  useEffect(() => {
    if (!spotlight || collapsed) return;
    const el = document.querySelector(spotlight);
    el?.setAttribute("data-tour-active", "1");
    return () => el?.removeAttribute("data-tour-active");
  }, [spotlight, collapsed]);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function act() {
    if (!step) return;
    if (step.id === "build") {
      if (!firstPalaceId) {
        const input = document.querySelector<HTMLInputElement>('[data-tour="palace-form"] input');
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.focus();
        return;
      }
      router.push(`/palaces/${firstPalaceId}`);
    } else if (step.id === "place") {
      router.push(firstRoomId ? `/rooms/${firstRoomId}` : firstPalaceId ? `/palaces/${firstPalaceId}` : "/home");
    } else if (step.id === "walk") {
      // The walk can't be observed server-side: acknowledge it, then go.
      await save({ onboarding_step: WALKED_STEP });
      if (firstRoomId) router.push(`/walk/${firstRoomId}?tour=1`);
    } else if (step.id === "study" && studyHref) {
      router.push(studyHref);
    }
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-40 rounded-full border border-primary/40 bg-card px-4 py-2 text-sm font-semibold shadow-card print:hidden"
      >
        Guided tour · {Math.min(progress.current + 1, ONBOARDING_STEPS.length)}/{ONBOARDING_STEPS.length}
      </button>
    );
  }

  return (
    <aside
      aria-label="Guided tour"
      className="card-base fixed bottom-4 left-4 right-4 z-40 border-primary/40 p-4 shadow-card-hover sm:left-auto sm:w-96 print:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight">
          {progress.complete ? "Tour complete" : `Step ${progress.current + 1} of ${ONBOARDING_STEPS.length}`}
        </p>
        <button onClick={() => setCollapsed(true)} className="btn-ghost !px-2 !py-0.5 !text-xs" aria-label="Minimise guided tour">
          Minimise
        </button>
      </div>

      <ol className="mt-2 flex gap-1.5" aria-hidden>
        {ONBOARDING_STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`h-1.5 flex-1 rounded-full ${
              progress.done[i] ? "bg-success" : i === progress.current ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </ol>

      {progress.complete ? (
        <>
          <p className="mt-3 text-xl font-semibold">Your palace loop is live</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You built it, placed loci, walked it, and recalled from it. Your analytics now have real sessions to draw on.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => save({ onboarded: true })} disabled={busy} className="btn-primary !px-3 !py-1.5">
              Finish
            </button>
            <Link href="/profile" className="btn-outline !px-3 !py-1.5">
              See my stats
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-xl font-semibold">{step.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
          {step.id === "place" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {facts.loci} of 5 loci placed so far.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={act}
              disabled={busy || (step.id === "study" && !studyHref)}
              className="btn-primary !px-3 !py-1.5"
            >
              {step.id === "build" && !firstPalaceId ? "Name your palace" : step.cta}
            </button>
            <button onClick={() => save({ onboarded: true })} disabled={busy} className="btn-ghost">
              Skip tour
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
