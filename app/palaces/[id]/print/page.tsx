"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Card, Locus, Palace, Room } from "@/types/database";
import { cardFront } from "@/types/database";

interface RoomBundle {
  room: Room;
  loci: Locus[];
  cards: Card[];
}

// Printable blueprint (Phase G): clean black-on-white traversal-order
// summary for mental reconstruction outside the app. Print via the browser
// (Save as PDF), or copy the plain-text blueprint for offline practice.
function textBlueprint(palace: Palace, bundles: RoomBundle[]): string {
  const lines = [`${palace.title}`, `=${"=".repeat(palace.title.length)}`, ""];
  bundles.forEach((b, i) => {
    lines.push(`Room ${i + 1}: ${b.room.title} (${b.room.width} x ${b.room.depth} x ${b.room.height} m)`);
    const byLocus = new Map<string, Card[]>();
    for (const c of b.cards) {
      const list = byLocus.get(c.locus_id) ?? [];
      list.push(c);
      byLocus.set(c.locus_id, list);
    }
    for (const l of b.loci) {
      const cards = byLocus.get(l.id) ?? [];
      const where = `${l.wall} wall, ${(Math.round((l.wall_offset ?? 0.5) * 100))}% along`;
      if (cards.length === 0) lines.push(`  [${l.label || "locus"}] ${where} (no card yet)`);
      else for (const c of cards) lines.push(`  [${l.label || "locus"}] ${where}: ${cardFront(c)}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

export default function PrintBlueprintPage() {
  const { id } = useParams<{ id: string }>();
  const { data: palace } = useFetch<Palace>(id ? `/api/palaces/${id}` : null);
  const { data: rooms } = useFetch<Room[]>(id ? `/api/rooms?palace=${id}` : null);
  const [bundles, setBundles] = useState<RoomBundle[] | null>(null);
  const [copied, setCopied] = useState(false);

  const orderedRooms = useMemo(
    () => (rooms ? [...rooms].sort((a, b) => a.created_at.localeCompare(b.created_at)) : null),
    [rooms]
  );

  useEffect(() => {
    if (!orderedRooms) return;
    let cancelled = false;
    (async () => {
      const out: RoomBundle[] = [];
      for (const room of orderedRooms) {
        const [lociRes, cardsRes] = await Promise.all([
          fetch(`/api/loci?room=${room.id}`).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/cards?room=${room.id}`).then((r) => (r.ok ? r.json() : [])),
        ]);
        const loci: Locus[] = [...(lociRes as Locus[])].sort((a, b) => a.position - b.position);
        out.push({ room, loci, cards: cardsRes as Card[] });
      }
      if (!cancelled) setBundles(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderedRooms]);

  if (!id) return <p className="p-6">Missing palace id.</p>;
  if (!palace || !bundles) return <p className="p-6 text-muted-foreground">Preparing blueprint…</p>;

  const text = textBlueprint(palace, bundles);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions); the text is still readable below.
    }
  }

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black sm:p-10">
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <button onClick={() => window.print()} className="btn-primary">
          Print / Save as PDF
        </button>
        <button onClick={copyText} className="btn-outline">
          {copied ? "Copied!" : "Copy text blueprint"}
        </button>
        <Link href={`/palaces/${id}`} className="btn-ghost">
          ← Back to blueprint
        </Link>
      </div>

      <h1 className="text-3xl font-bold">{palace.title}</h1>
      <p className="mt-1 text-sm">Memory palace blueprint — walk it in your mind, room by room.</p>

      {bundles.map((b, i) => (
        <section key={b.room.id} className="mt-8 break-inside-avoid">
          <h2 className="border-b-2 border-black pb-1 text-xl font-bold">
            Room {i + 1}: {b.room.title}{" "}
            <span className="text-sm font-normal">
              ({b.room.width} × {b.room.depth} × {b.room.height} m)
            </span>
          </h2>
          {b.loci.length === 0 ? (
            <p className="mt-2 text-sm italic">No loci placed yet.</p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {b.loci.map((l) => {
                const cards = b.cards.filter((c) => c.locus_id === l.id);
                return (
                  <li key={l.id} className="text-sm">
                    <strong>
                      {i + 1}.{l.position + 1} [{l.label || "locus"}]
                    </strong>{" "}
                    — {l.wall} wall, {Math.round((l.wall_offset ?? 0.5) * 100)}% along
                    {cards.length === 0 ? (
                      <span className="italic"> (no card yet)</span>
                    ) : (
                      <ul className="ml-6 list-disc">
                        {cards.map((c) => (
                          <li key={c.id}>{cardFront(c)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}

      <details className="mt-10 print:hidden">
        <summary className="cursor-pointer text-sm font-medium text-link">Plain-text blueprint (for offline practice)</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-4 text-xs text-foreground">{text}</pre>
      </details>
    </div>
  );
}
