"use client";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Card, Locus, Room } from "@/types/database";
import { cardBack, cardFront } from "@/types/database";

type Mode = "walk" | "random";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function StudyPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("walk");
  const { data: room, loading: loadingRoom, error: roomError } = useFetch<Room>(
    roomId ? `/api/rooms/${roomId}` : null
  );
  const { data: loci, loading: loadingLoci } = useFetch<Locus[]>(
    roomId ? `/api/loci?room=${roomId}` : null
  );
  const { data: cards, loading: loadingCards, error } = useFetch<Card[]>(
    roomId ? `/api/cards?room=${roomId}` : null
  );
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [shuffleSeed, setShuffleSeed] = useState(1);

  const ordered = useMemo(() => {
    if (!cards) return null;
    if (mode === "random") {
      const rand = mulberry32(shuffleSeed);
      const shuffled = [...cards];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    const pos = new Map((loci ?? []).map((l) => [l.id, l.position]));
    return [...cards].sort((a, b) => (pos.get(a.locus_id) ?? 0) - (pos.get(b.locus_id) ?? 0));
  }, [cards, loci, mode, shuffleSeed]);

  if (!roomId) return <p className="p-6">This study link is missing a room id.</p>;
  if (loadingRoom || loadingLoci || loadingCards) {
    return <p className="p-6 text-muted-foreground">Loading study...</p>;
  }
  if (!room) return <p className="p-6">This room could not be found{roomError ? ` (${roomError})` : ""}.</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load study: {error}</p>;
  if (!ordered?.length) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="mb-2 text-sm text-muted-foreground">{room.title}</p>
        <p className="text-lg">This room has no cards yet.</p>
      </div>
    );
  }

  const card = ordered[index];
  const locusLabel = loci?.find((l) => l.id === card.locus_id)?.label;
  const isLast = index === ordered.length - 1;

  function switchMode(next: Mode) {
    setMode(next);
    if (next === "random") setShuffleSeed((s) => s + 1);
    setIndex(0);
    setShowAnswer(false);
    setScore(0);
  }

  async function handleAnswer(correct: boolean) {
    if (!roomId || !ordered) return;
    const nextScore = correct ? score + 1 : score;
    setScore(nextScore);

    if (isLast) {
      try {
        const res = await fetch("/api/study-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: roomId, score: nextScore, total: ordered.length }),
        });
        if (!res.ok) console.error("Failed to save study session");
      } catch {
        console.error("Failed to save study session");
      }
      router.push(`/results?score=${nextScore}&total=${ordered.length}`);
    } else {
      setIndex(index + 1);
      setShowAnswer(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <p className="mb-1 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {room.title}{locusLabel ? ` — ${locusLabel}` : ""}
      </p>
      <p className="mb-3 text-center font-display text-lg text-accent">
        Locus {index + 1} of {ordered.length}
      </p>
      <div className="mb-5 flex justify-center gap-2 text-sm">
        <button
          onClick={() => switchMode("walk")}
          className={mode === "walk" ? "btn-primary !px-3 !py-1.5" : "btn-ghost"}
        >
          Walkthrough
        </button>
        <button
          onClick={() => switchMode("random")}
          className={mode === "random" ? "btn-primary !px-3 !py-1.5" : "btn-ghost"}
        >
          Random Walk
        </button>
      </div>

      <div className="card-base relative overflow-hidden p-10 text-center">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-primary via-accent to-primary" />
        <div className="flex min-h-40 items-center justify-center">
          <p className="text-xl font-medium leading-relaxed">
            {showAnswer ? cardBack(card) : cardFront(card)}
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        {!showAnswer ? (
          <button onClick={() => setShowAnswer(true)} className="btn-primary">
            Show Answer
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer(false)}
              className="rounded-lg bg-destructive px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90"
            >
              Got it wrong
            </button>
            <button
              onClick={() => handleAnswer(true)}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              Got it right
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
