"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { layoutBlueprint } from "@/lib/blueprint";
import { tourOrder } from "@/lib/scene3d";
import type { Card, Level, Locus, Opening, Palace, Room } from "@/types/database";
import { cardBack, cardFront } from "@/types/database";

interface RoomBundle {
  room: Room;
  loci: Locus[];
  cards: Card[];
}

function cardLine(c: Card, answers: boolean): string {
  const front = cardFront(c);
  return answers && cardBack(c) ? `${front} → ${cardBack(c)}` : front;
}

// Printable blueprint (Phase G): clean black-on-white traversal-order
// summary for mental reconstruction outside the app. Print via the browser
// (Save as PDF), or copy the plain-text blueprint for offline practice.
function textBlueprint(palace: Palace, bundles: RoomBundle[], openings: Opening[], answers: boolean): string {
  const lines = [`${palace.title}`, `=${"=".repeat(palace.title.length)}`, ""];
  const titleOf = new Map(bundles.map((b) => [b.room.id, b.room.title]));
  bundles.forEach((b, i) => {
    lines.push(`Room ${i + 1}: ${b.room.title} (${b.room.width} x ${b.room.depth} x ${b.room.height} m)`);
    const doors = openings.filter((o) => o.room_id === b.room.id);
    for (const o of doors) {
      const to = o.target_room_id ? ` to ${titleOf.get(o.target_room_id) ?? "another room"}` : "";
      lines.push(`  (${o.kind} on the ${o.wall} wall${to})`);
    }
    const byLocus = new Map<string, Card[]>();
    for (const c of b.cards) {
      const list = byLocus.get(c.locus_id) ?? [];
      list.push(c);
      byLocus.set(c.locus_id, list);
    }
    b.loci.forEach((l, li) => {
      const cards = byLocus.get(l.id) ?? [];
      const where = `${l.wall} wall, ${(Math.round((l.wall_offset ?? 0.5) * 100))}% along`;
      const tag = `${li + 1}. [${l.label || "locus"}]`;
      if (cards.length === 0) lines.push(`  ${tag} ${where} (no card yet)`);
      else for (const c of cards) lines.push(`  ${tag} ${where}: ${cardLine(c, answers)}`);
    });
    lines.push("");
  });
  return lines.join("\n");
}

export default function PrintBlueprintPage() {
  const { id } = useParams<{ id: string }>();
  const { data: palace } = useFetch<Palace>(id ? `/api/palaces/${id}` : null);
  const { data: rooms, error: roomsError } = useFetch<Room[]>(id ? `/api/rooms?palace=${id}` : null);
  const { data: levels } = useFetch<Level[]>(id ? `/api/levels?palace=${id}` : null);
  const { data: openings } = useFetch<Opening[]>(id ? `/api/openings?palace=${id}` : null);
  const [bundles, setBundles] = useState<RoomBundle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [answers, setAnswers] = useState(true);

  const orderedRooms = useMemo(
    () => (rooms ? [...rooms].sort((a, b) => a.created_at.localeCompare(b.created_at)) : null),
    [rooms]
  );

  // All rooms load in parallel (was one room at a time) and failures surface
  // instead of silently printing an empty room.
  useEffect(() => {
    if (!orderedRooms) return;
    let cancelled = false;
    (async () => {
      try {
        const out = await Promise.all(
          orderedRooms.map(async (room) => {
            const [lociRes, cardsRes] = await Promise.all([
              fetch(`/api/loci?room=${room.id}`),
              fetch(`/api/cards?room=${room.id}`),
            ]);
            if (!lociRes.ok || !cardsRes.ok) throw new Error(`Could not load "${room.title}"`);
            const loci = tourOrder((await lociRes.json()) as Locus[]);
            return { room, loci, cards: (await cardsRes.json()) as Card[] };
          })
        );
        if (!cancelled) setBundles(out);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the palace");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderedRooms]);

  if (!id) return <p className="p-6">Missing palace id.</p>;
  if (loadError || roomsError) return <p className="p-6 text-destructive">Failed to prepare the blueprint: {loadError ?? roomsError}</p>;
  if (!palace || !bundles) return <p className="p-6 text-muted-foreground">Preparing blueprint…</p>;

  const allOpenings = openings ?? [];
  const text = textBlueprint(palace, bundles, allOpenings, answers);
  const numbering = new Map(bundles.map((b, i) => [b.room.id, i + 1]));
  const firstLevelId = [...(levels ?? [])].sort((a, b) => a.idx - b.idx)[0]?.id ?? null;
  // One top-down map per level (rooms without a level belong to the first).
  const levelGroups = (levels && levels.length > 0 ? [...levels].sort((a, b) => a.idx - b.idx) : [{ id: null, name: "Floor plan" } as unknown as Level])
    .map((lv) => {
      const inLevel = bundles.filter((b) => (b.room.level_id ?? firstLevelId) === lv.id).map((b) => b.room);
      const ids = new Set(inLevel.map((r) => r.id));
      return {
        name: lv.name,
        plan: layoutBlueprint(
          inLevel,
          bundles.flatMap((b) => b.loci).filter((l) => ids.has(l.room_id)),
          allOpenings.filter((o) => ids.has(o.room_id)),
          numbering
        ),
      };
    })
    .filter((g) => g.plan);

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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} />
          Include answers
        </label>
        <Link href={`/palaces/${id}`} className="btn-ghost">
          ← Back to blueprint
        </Link>
      </div>

      <h1 className="text-3xl font-bold">{palace.title}</h1>
      <p className="mt-1 text-sm">Memory palace blueprint — walk it in your mind, room by room.</p>

      {levelGroups.map((g) => (
        <figure key={g.name} className="mt-6 break-inside-avoid">
          <svg
            viewBox={`0 0 ${g.plan!.width} ${g.plan!.height}`}
            className="w-full max-w-xl border border-black"
            role="img"
            aria-label={`Top-down plan of ${palace.title}${levelGroups.length > 1 ? ` — ${g.name}` : ""}`}
          >
            {g.plan!.rooms.map((r) => (
              <g key={r.id}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#fff" stroke="#000" strokeWidth={0.12} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2} fontSize={Math.min(1.1, r.w / 8)} textAnchor="middle" fill="#000">
                  {r.number}. {r.title}
                </text>
              </g>
            ))}
            {/* Furniture footprints: landmarks for rebuilding the room in your head. */}
            {g.plan!.furniture.map((f, i) => (
              <rect key={`f${i}`} x={f.x} y={f.y} width={f.w} height={f.h} rx={0.08} fill="#000" fillOpacity={0.12} stroke="#000" strokeOpacity={0.35} strokeWidth={0.04} />
            ))}
            {g.plan!.openings.map((o, i) => (
              <line
                key={i}
                x1={o.x1}
                y1={o.y1}
                x2={o.x2}
                y2={o.y2}
                /* A doorway is a gap in the wall: a white stroke over the room outline. */
                stroke="#fff"
                strokeWidth={0.3}
              />
            ))}
            {g.plan!.loci.map((l, i) => (
              <g key={i}>
                <circle cx={l.x} cy={l.y} r={0.42} fill="#000" />
                <text x={l.x} y={l.y + 0.22} fontSize={0.6} textAnchor="middle" fill="#fff">
                  {l.n}
                </text>
              </g>
            ))}
            <text x={g.plan!.width - 0.4} y={0.9} fontSize={0.7} textAnchor="end" fill="#000">
              N ↑
            </text>
          </svg>
          <figcaption className="mt-1 text-xs">
            {levelGroups.length > 1 ? `${g.name} — ` : ""}Top-down plan, north at top. Numbers follow the study path in each room.
          </figcaption>
        </figure>
      ))}

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
              {b.loci.map((l, li) => {
                const cards = b.cards.filter((c) => c.locus_id === l.id);
                return (
                  <li key={l.id} className="text-sm">
                    <strong>
                      {i + 1}.{li + 1} [{l.label || "locus"}]
                    </strong>{" "}
                    — {l.wall} wall, {Math.round((l.wall_offset ?? 0.5) * 100)}% along
                    {cards.length === 0 ? (
                      <span className="italic"> (no card yet)</span>
                    ) : (
                      <ul className="ml-6 list-disc">
                        {cards.map((c) => (
                          <li key={c.id}>{cardLine(c, answers)}</li>
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
