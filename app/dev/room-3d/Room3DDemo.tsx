"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Card, Locus, Opening, Room } from "@/types/database";
import { locusPercent } from "@/lib/geometry";
import { returnDoor, spawnAtDoor, tourOrder } from "@/lib/scene3d";
import type { Pose } from "@/lib/walk";
import type { LociActions } from "@/components/scene3d/actions";
import { useSearchParam } from "@/hooks/useSearchParam";

const Room3DEditor = dynamic(() => import("@/components/scene3d/Room3DEditor"), { ssr: false });
const WalkView = dynamic(() => import("@/components/scene3d/WalkView"), { ssr: false });

const T = "2026-10-01T12:00:00.000Z";
const room = (id: string, title: string, w: number, d: number, bg: string | null): Room => ({
  id,
  palace_id: "demo-palace",
  user_id: "demo",
  title,
  background: bg,
  metadata: {},
  width: w,
  depth: d,
  height: 3,
  level_id: "lvl-0",
  pos_x: 0,
  pos_z: 0,
  rotation: 0,
  outline: null,
  created_at: T,
});
const ROOMS: Room[] = [room("r-hall", "Entrance hall", 6, 4, null), room("r-lib", "Library", 5, 7, null)];
const op = (id: string, roomId: string, wall: Opening["wall"], offset: number, widthM: number, target: string | null, kind: Opening["kind"] = "door"): Opening => ({
  id,
  room_id: roomId,
  wall,
  wall_offset: offset,
  width: 0,
  width_m: widthM,
  kind,
  target_room_id: target,
  created_at: T,
});
const OPENINGS: Opening[] = [
  op("o-1", "r-hall", "east", 0.5, 0.9, "r-lib"),
  op("o-2", "r-lib", "west", 2 / 7, 0.9, "r-hall"),
  op("o-3", "r-hall", "north", 0.3, 1.2, null, "archway"),
  op("o-4", "r-hall", "north", 0.75, 0.9, null),
  op("o-5", "r-lib", "north", 0.5, 1.2, null, "archway"),
];
let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const locus = (id: string, roomId: string, label: string, wall: Locus["wall"], off: number, h: number, pos: number): Locus => ({
  id,
  room_id: roomId,
  x: 0,
  y: 0,
  z: null,
  label,
  tags: [],
  position: pos,
  wall,
  wall_offset: off,
  height: h,
  created_at: T,
});
const LOCI: Locus[] = [
  locus("l-1", "r-hall", "Coat rack", "west", 0.5, 1.7, 0),
  locus("l-2", "r-hall", "Mirror", "north", 0.5, 1.6, 1),
  locus("l-3", "r-hall", "Clock", "south", 0.7, 2.2, 2),
  locus("l-4", "r-lib", "Globe", "north", 0.2, 1.1, 0),
  locus("l-5", "r-lib", "Fireplace", "east", 0.5, 1.0, 1),
  locus("l-6", "r-lib", "Portrait", "south", 0.5, 1.9, 2),
];
const card = (id: string, locusId: string, front: string, back: string): Card => ({
  id,
  locus_id: locusId,
  user_id: "demo",
  type: "basic",
  front: { text: front },
  back: { text: back },
  media_refs: [],
  created_at: T,
});
const CARDS: Card[] = [
  card("c-1", "l-1", "Capital of Canada?", "Ottawa"),
  card("c-2", "l-2", "Speed of light (m/s)?", "≈ 3 × 10⁸ m/s"),
  card("c-3", "l-2", "Who wrote 'Hamlet'?", "William Shakespeare"),
  card("c-4", "l-3", "Year the Berlin Wall fell?", "1989"),
  card("c-5", "l-4", "Largest ocean?", "Pacific"),
  card("c-6", "l-5", "Chemical symbol for gold?", "Au"),
];

export function Room3DDemo() {
  const [roomId, setRoomId] = useState("r-hall");
  const tabParam = useSearchParam("tab");
  const [tabChoice, setTab] = useState<"edit" | "walk" | null>(null);
  const tab = tabChoice ?? (tabParam === "walk" ? "walk" : "edit");
  const [loci, setLoci] = useState<Locus[]>(LOCI);
  const [cards, setCards] = useState<Card[]>(CARDS);
  const [spawn, setSpawn] = useState<Pose | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const room = ROOMS.find((r) => r.id === roomId) as Room;
  const roomLoci = useMemo(() => loci.filter((l) => l.room_id === roomId), [loci, roomId]);
  const roomCards = useMemo(() => cards.filter((c) => roomLoci.some((l) => l.id === c.locus_id)), [cards, roomLoci]);
  const roomOpenings = OPENINGS.filter((o) => o.room_id === roomId);
  const titles = Object.fromEntries(ROOMS.map((r) => [r.id, r.title]));
  const note = (s: string) => setLog((l) => [s, ...l].slice(0, 6));

  const actions: LociActions = useMemo(
    () => ({
      async createLocus(input) {
        const l: Locus = { ...locus(nid("l"), input.room_id, input.label, input.wall, input.wall_offset, input.height, input.position), created_at: new Date().toISOString() };
        setLoci((ls) => [...ls, l]);
        note(`created ${l.label} on ${l.wall} @ ${l.wall_offset?.toFixed(2)}, h ${l.height}`);
        return l;
      },
      async updateLocus(id, patch) {
        setLoci((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
        note(`updated ${id}: ${JSON.stringify(patch)}`);
      },
      async setPositions(updates) {
        setLoci((ls) => ls.map((l) => ({ ...l, position: updates.find((u) => u.id === l.id)?.position ?? l.position })));
        note(`reordered ${updates.length} loci`);
      },
      async deleteLocus(id) {
        setLoci((ls) => ls.filter((l) => l.id !== id));
        setCards((cs) => cs.filter((c) => c.locus_id !== id));
        note(`deleted ${id}`);
      },
      async createCard(input) {
        setCards((cs) => [...cs, { ...card(nid("c"), input.locus_id, input.front, input.back), created_at: new Date().toISOString() }]);
        note(`card added`);
      },
      async updateCard(id, patch) {
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, front: { text: patch.front }, back: { text: patch.back } } : c)));
        note(`card ${id} updated`);
      },
      async deleteCard(id) {
        setCards((cs) => cs.filter((c) => c.id !== id));
        note(`card ${id} deleted`);
      },
    }),
    []
  );

  function enter(target: string, from: string | null) {
    const r = ROOMS.find((x) => x.id === target);
    if (!r) return;
    const door = from ? returnDoor(OPENINGS, target, from) : null;
    setSpawn(door ? spawnAtDoor(door, r) : null);
    setRoomId(target);
    if (from) note(`walked from ${titles[from]} into ${r.title}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Demo view" className="inline-flex rounded-xl border border-border bg-card p-1 text-sm">
          {(
            [
              ["edit", "3D editor"],
              ["walk", "Walk & tour"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Room</span>
          <select className="input-base w-44" value={roomId} onChange={(e) => enter(e.target.value, null)}>
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tab === "edit" ? (
        <Room3DEditor key={room.id} room={room} loci={roomLoci} openings={roomOpenings} cards={roomCards} actions={actions} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <WalkView
            key={`${room.id}:${spawn ? `${spawn.x},${spawn.z}` : "c"}`}
            room={room}
            loci={roomLoci}
            openings={roomOpenings}
            cards={roomCards}
            roomTitles={titles}
            spawn={spawn}
            onExitDoor={(o) => o.target_room_id && enter(o.target_room_id, room.id)}
            onGrade={(c, ok) => note(`graded "${c.front.text}": ${ok ? "got it" : "missed"}`)}
            className="h-[600px]"
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-base p-4 text-sm">
          <h2 className="mb-2 font-semibold">Same data, 2D view (wall anchors)</h2>
          <ol className="space-y-1">
            {tourOrder(roomLoci).map((l, i) => {
              const pct = locusPercent(l, room);
              return (
                <li key={l.id} className="flex justify-between gap-2">
                  <span>
                    {i + 1}. {l.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {l.wall} · {(l.wall_offset ?? 0).toFixed(2)} · h {(l.height ?? 0).toFixed(2)} · plan {pct.x.toFixed(0)}%,{pct.y.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="card-base p-4 text-sm">
          <h2 className="mb-2 font-semibold">Saves (in memory)</h2>
          {log.length === 0 ? <p className="text-muted-foreground">Edits show up here.</p> : log.map((l, i) => <p key={i} className="truncate font-mono text-xs">{l}</p>)}
        </div>
      </div>
    </div>
  );
}
