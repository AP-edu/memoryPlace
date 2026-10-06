"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useFetch } from "@/hooks/useFetch";
import PalacePicker, { type PalaceTarget } from "@/components/decks/PalacePicker";
import { ANCHOR_NUDGE } from "@/lib/deckLink";
import { parseAnswers, summarizeSession } from "@/lib/sessionSummary";
import type { SessionAnswer } from "@/lib/reviewTypes";
import type { HomeSummary } from "@/lib/homeSummary";
import type { StudySession } from "@/types/database";

// Only same-origin paths may be used as the "back" target.
function safeBack(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/palaces";
}

function pctText(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function WeakRow({ a, deckId }: { a: SessionAnswer; deckId: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState<PalaceTarget>({ palaceId: "", roomId: "", locusId: "" });

  async function snooze(days: number) {
    const res = await fetch("/api/reviews", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a.kind === "flashcard" ? { flashcard_id: a.id, days } : { card_id: a.id, days }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(body.error ?? "Could not reschedule.");
    setMsg(body.scheduled === false ? "Anchor it to a palace to schedule it." : days === 0 ? "Due again now." : `Back in ${days} day${days === 1 ? "" : "s"}.`);
  }

  async function move() {
    if (!a.cardId || !target.locusId) return setMsg("Pick a destination locus.");
    const res = await fetch(`/api/cards/${a.cardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locus_id: target.locusId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(body.error ?? "Could not move the card.");
    setMsg("Moved to the new locus.");
    setMoving(false);
  }

  const place = [a.roomTitle, a.locusLabel].filter(Boolean).join(" · ");
  return (
    <li className="card-base p-3 text-left">
      <p className="font-medium">{a.label || "Untitled card"}</p>
      {place && <p className="text-xs text-muted-foreground">{place}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {a.roomId ? (
          <Link href={`/rooms/${a.roomId}`} className="btn-outline !px-2.5 !py-1">
            Edit in room
          </Link>
        ) : deckId ? (
          <Link href={`/decks/${deckId}`} className="btn-outline !px-2.5 !py-1">
            Edit in deck
          </Link>
        ) : null}
        <button onClick={() => snooze(0)} className="btn-ghost">
          Review again now
        </button>
        <button onClick={() => snooze(3)} className="btn-ghost">
          Snooze 3 days
        </button>
        {a.cardId && (
          <button onClick={() => setMoving((v) => !v)} className="btn-ghost">
            Move to another locus
          </button>
        )}
      </div>
      {moving && (
        <div className="mt-2 space-y-2">
          <PalacePicker value={target} onChange={setTarget} withLocus />
          <button onClick={move} className="btn-primary !px-3 !py-1.5 text-xs">
            Move card
          </button>
        </div>
      )}
      {a.kind === "flashcard" && !a.cardId && <p className="mt-2 text-xs text-highlight">{ANCHOR_NUDGE}</p>}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </li>
  );
}

export default function ResultsContent() {
  const params = useSearchParams();
  const score = Number(params.get("score") ?? 0);
  const total = Number(params.get("total") ?? 0);
  const back = safeBack(params.get("back"));
  const backLabel = params.get("backLabel") || "Back to palaces";
  const sessionId = params.get("session");

  const { data: saved } = useFetch<StudySession>(sessionId ? `/api/study-sessions/${sessionId}` : null);
  const { data: home } = useFetch<HomeSummary>(`/api/home/summary?tz=${new Date().getTimezoneOffset()}`);

  const answers = parseAnswers(saved?.results?.answers);
  const summary = summarizeSession(answers);
  const shownScore = answers.length > 0 ? summary.score : score;
  const shownTotal = answers.length > 0 ? summary.total : total;
  const pct = shownTotal > 0 ? shownScore / shownTotal : 0;
  const deckId = saved?.deck_id ?? null;

  return (
    <div className="mx-auto max-w-2xl p-4 pb-20 text-center sm:p-6">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-highlight">The chamber has been visited</p>
      <h1 className="text-4xl font-semibold">Session complete</h1>
      <div aria-hidden className="meander-rule mx-auto mt-4 max-w-xs" />
      <p className="mt-6 font-display text-7xl text-link">
        {shownScore} <span className="text-3xl text-muted-foreground">/ {shownTotal}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {pctText(pct)} recalled
        {home && home.streakDays > 0 ? ` · ${home.streakDays}-day streak` : ""}
      </p>

      {summary.unanchored > 0 && deckId && (
        <p className="mx-auto mt-4 max-w-md rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-highlight">
          {summary.unanchored} card{summary.unanchored === 1 ? " was" : "s were"} not anchored. {ANCHOR_NUDGE}{" "}
          <Link href={`/decks/${deckId}?port=1`} className="font-medium underline">
            Port to palace
          </Link>
        </p>
      )}

      {summary.rooms.length > 0 && (
        <section className="mt-8 text-left">
          <h2 className="mb-3 text-xl font-semibold">Mastery by room</h2>
          <ul className="space-y-2">
            {summary.rooms.map((r) => (
              <li key={r.roomId || "none"} className="card-base p-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  {r.roomId ? (
                    <Link href={`/rooms/${r.roomId}`} className="font-medium hover:underline">
                      {r.roomTitle}
                    </Link>
                  ) : (
                    <span className="font-medium text-muted-foreground">{r.roomTitle}</span>
                  )}
                  <span className="tabular-nums text-muted-foreground">
                    {r.correct}/{r.total} · {pctText(r.mastery)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${r.mastery >= 0.8 ? "bg-success" : r.mastery >= 0.5 ? "bg-accent" : "bg-destructive"}`}
                    style={{ width: pctText(r.mastery) }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.weak.length > 0 ? (
        <section className="mt-8 text-left">
          <h2 className="mb-3 text-xl font-semibold">Needs reinforcement ({summary.weak.length})</h2>
          <ul className="space-y-2">
            {summary.weak.map((a, i) => (
              <WeakRow key={`${a.id}-${i}`} a={a} deckId={deckId} />
            ))}
          </ul>
        </section>
      ) : (
        answers.length > 0 && <p className="mt-8 text-success">No weak cards — every answer was right.</p>
      )}

      <p className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={back} className="btn-outline">
          {backLabel}
        </Link>
        {back !== "/home" && back !== "/palaces" && (
          <Link href="/home" className="btn-ghost">
            Home
          </Link>
        )}
      </p>
    </div>
  );
}
