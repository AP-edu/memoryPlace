"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Level, Opening, OpeningKind, Palace, Room } from "@/types/database";
import { DEFAULT_OPENING_WIDTH_M, openingWidthM, wallLength } from "@/lib/geometry";
import {
  adjacentRooms,
  autoLinks,
  findLinkTarget,
  findPartner,
  fmtM,
  gridLines,
  moveRect,
  overlapsAny,
  planOpening,
  reconcileLinks,
  roomRect,
  snapDraw,
  snapMove,
  snapResize,
  wallSeg,
  type SnapGuides,
  type Handle,
  type LinkableOpening,
  type OpeningPlan,
  type PlacementRoom,
  type Pt,
  type Rect,
} from "@/lib/grid";
import type { EditorBackend, LevelPatch, OpeningPatch, RoomPatch } from "./backend";
import { HALLWAY_METADATA, HALLWAY_WIDTH_M, isHallway, planHallway, sharedStretch } from "@/lib/hallway";

// Lightweight 2D grid editor (SVG). Level coordinates are metres; the SVG
// viewBox is in metres too with svg-y = -z, so north (+z) is at the TOP.
// State is local and optimistic; changes are debounced and persisted through
// the EditorBackend (HTTP in the app, in-memory in the dev demo).

type Tool = "select" | "room" | "connect";
/** What the "Connect rooms" chooser creates. Archway (open gap) is the plain default. */
type ConnectKind = "archway" | "door" | "hallway" | "hallway-door";
interface Chooser {
  a: string;
  b: string;
  /** World coordinate along the shared wall where the opening goes (contextual "+" badge). */
  at?: number;
}
type Selection = { type: "room"; id: string } | { type: "opening"; id: string } | null;
type Drag =
  | { kind: "pan"; sx: number; sy: number; cx: number; cz: number }
  | { kind: "draw"; a: Pt; b: Pt }
  | { kind: "move"; id: string; start: Pt; orig: Rect; rect: Rect; guides: SnapGuides }
  | { kind: "resize"; id: string; handle: Handle; orig: Rect; rect: Rect; guides: SnapGuides };
interface View {
  cx: number;
  cz: number;
  ppm: number; // pixels per metre
}

const SAVE_DELAY_MS = 400;
const MIN_PPM = 4;
const MAX_PPM = 300;
const HANDLES: Handle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
// Room colour swatches (stored per room as a hex). They are drawn as a tint
// over the themed card colour in 2D and over the themed floor in 3D, so labels
// keep their contrast in both light and dark themes.
export const ROOM_COLORS: Array<{ value: string | null; name: string }> = [
  { value: null, name: "Default" },
  { value: "#4255ff", name: "Indigo" },
  { value: "#3ccfcf", name: "Cyan" },
  { value: "#ffcd1f", name: "Yellow" },
  { value: "#ff6b81", name: "Coral" },
  { value: "#a78bfa", name: "Violet" },
  { value: "#3ddc97", name: "Mint" },
];
// Keep it simple: 1 m by default, 0.5 m for finer work.
const SNAP_CHOICES = [1, 0.5];
const DEFAULT_SNAP = 1;
/** Standard storey: rooms are 3 m tall and each level sits idx * 3 m up unless changed under Advanced. */
export const STANDARD_HEIGHT_M = 3;
/** Magnetic pull towards other rooms' edges, in screen pixels. */
const MAGNET_PX = 12;
const snapKey = (palaceId: string) => `mp-snap:${palaceId}`;
const subscribeNoop = () => () => undefined;
function readStoredSnap(palaceId: string): number | null {
  try {
    const v = Number(localStorage.getItem(snapKey(palaceId)));
    return SNAP_CHOICES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

const byIdx = (a: Level, b: Level) => a.idx - b.idx || a.created_at.localeCompare(b.created_at);
const isTemp = (id: string) => id.startsWith("tmp-");

function fitView(rooms: Room[], w: number, h: number): View {
  if (rooms.length === 0) return { cx: 5, cz: 4, ppm: 40 };
  const x0 = Math.min(...rooms.map((r) => r.pos_x));
  const z0 = Math.min(...rooms.map((r) => r.pos_z));
  const x1 = Math.max(...rooms.map((r) => r.pos_x + r.width));
  const z1 = Math.max(...rooms.map((r) => r.pos_z + r.depth));
  const ppm = Math.min(MAX_PPM, Math.max(MIN_PPM, Math.min(w / (x1 - x0 + 4), h / (z1 - z0 + 4))));
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ppm };
}

function handlePos(r: Rect, h: Handle): Pt {
  const x = h.includes("e") ? r.x + r.w : h.includes("w") ? r.x : r.x + r.w / 2;
  const z = h.includes("n") ? r.z + r.d : h.includes("s") ? r.z : r.z + r.d / 2;
  return { x, z };
}

const HANDLE_CURSOR: Record<Handle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

export interface GridEditorProps {
  palace: Palace;
  initialLevels: Level[];
  initialRooms: Room[];
  initialOpenings: Opening[];
  backend: EditorBackend;
  /** Called whenever the local room list changes (e.g. to render a room list beside the editor). */
  onRoomsChange?: (rooms: Room[], levels: Level[], openings: Opening[]) => void;
  onPreviewRoom?: (roomId: string) => void;
  /** Controlled canvas selection highlight (e.g. from a room list beside the editor). */
  selectedRoomId?: string | null;
  /** Reports canvas room selection outward (null when cleared or non-room). */
  onSelectRoom?: (id: string | null) => void;
  /** Controlled active level (e.g. shared with a 3D palace tab). Uncontrolled when omitted. */
  activeLevelId?: string | null;
  /** Reports active-level changes outward. */
  onActiveLevelChange?: (id: string | null) => void;
}

export function GridEditor({
  palace,
  initialLevels,
  initialRooms,
  initialOpenings,
  backend,
  onRoomsChange,
  onPreviewRoom,
  selectedRoomId,
  onSelectRoom,
  activeLevelId: controlledLevelId,
  onActiveLevelChange,
}: GridEditorProps) {
  const [levels, setLevels] = useState<Level[]>(() => [...initialLevels].sort(byIdx));
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [openings, setOpenings] = useState<Opening[]>(initialOpenings);
  // The stored palace.grid_snap defaults to 0.5 in the DB, so an explicit
  // choice is remembered per palace in localStorage; otherwise 1 m.
  const [chosenSnap, setGridSnap] = useState<number | null>(null);
  const storedSnap = useSyncExternalStore(
    subscribeNoop,
    () => readStoredSnap(palace.id),
    () => null
  );
  const gridSnap = chosenSnap ?? storedSnap ?? DEFAULT_SNAP;
  const [innerLevelId, setInnerLevelId] = useState<string | null>(() => [...initialLevels].sort(byIdx)[0]?.id ?? null);
  // Controlled active level: the page can own it (shared with the 3D tab);
  // every internal change still reports outward via onActiveLevelChange.
  const activeLevelId = controlledLevelId !== undefined ? controlledLevelId : innerLevelId;
  const setActiveLevelId = (id: string | null) => {
    if (controlledLevelId === undefined) setInnerLevelId(id);
    onActiveLevelChange?.(id);
  };
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<Selection>(null);
  // Selection sync with outside UI (room cards below the canvas): report
  // canvas room picks outward, adopt externally requested ones. The adopt
  // half is a render-phase update (the sanctioned sync-external-state pattern).
  const [prevExternalRoom, setPrevExternalRoom] = useState<string | null | undefined>(undefined);
  if (selectedRoomId !== prevExternalRoom) {
    setPrevExternalRoom(selectedRoomId);
    if (selectedRoomId) {
      setSelection({ type: "room", id: selectedRoomId });
    } else {
      setSelection((s) => (s?.type === "room" && s.id === prevExternalRoom ? null : s));
    }
  }
  useEffect(() => {
    onSelectRoom?.(selection?.type === "room" ? selection.id : null);
  }, [selection, onSelectRoom]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [connectFirst, setConnectFirst] = useState<string | null>(null);
  const [chooser, setChooser] = useState<Chooser | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [view, setView] = useState<View>(() => {
    const first = [...initialLevels].sort(byIdx)[0]?.id ?? null;
    return fitView(initialRooms.filter((r) => (r.level_id ?? first) === first), 900, 560);
  });
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const spaceDown = useRef(false);
  const seq = useRef(0);
  const idMap = useRef(new Map<string, string>());
  const creating = useRef(new Map<string, Promise<string | null>>());
  const confirmedRooms = useRef<Map<string, Room> | null>(null);
  const timers = useRef(new Map<string, { patch: Record<string, unknown>; t: ReturnType<typeof setTimeout>; flush: (p: Record<string, unknown>) => void }>());

  const firstLevelId = levels[0]?.id ?? null;
  const levelOf = useCallback((r: Room) => r.level_id ?? firstLevelId, [firstLevelId]);
  const activeLevel = levels.find((l) => l.id === activeLevelId) ?? levels[0] ?? null;
  const minSize = 1;

  // ------------------------------------------------------------ effects
  useEffect(() => {
    onRoomsChange?.(rooms, levels, openings);
  }, [rooms, levels, openings, onRoomsChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let fitted = false;
    const first = [...initialLevels].sort(byIdx)[0]?.id ?? null;
    const firstRooms = initialRooms.filter((r) => (r.level_id ?? first) === first);
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width <= 0 || box.height <= 0) return;
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      setSize({ w, h });
      // Fit the initial level once the real canvas size is known.
      if (!fitted) {
        fitted = true;
        setView(fitView(firstRooms, w, h));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial fit only
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const ppm = Math.min(MAX_PPM, Math.max(MIN_PPM, v.ppm * Math.exp(-e.deltaY * 0.0015)));
        const wx = v.cx + (px - rect.width / 2) / v.ppm;
        const wz = v.cz - (py - rect.height / 2) / v.ppm;
        return { ppm, cx: wx - (px - rect.width / 2) / ppm, cz: wz + (py - rect.height / 2) / ppm };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement | null)?.closest?.("input,textarea,select")) spaceDown.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Flush pending debounced saves when the editor unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const { t, patch, flush } of map.values()) {
        clearTimeout(t);
        flush(patch);
      }
      map.clear();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  // ------------------------------------------------------------ persistence helpers
  function track<T>(p: Promise<T>): Promise<T> {
    setPending((n) => n + 1);
    return p
      .catch((err: unknown) => {
        setError(err instanceof Error && err.message ? `Couldn't save: ${err.message}` : "Couldn't save changes");
        throw err;
      })
      .finally(() => setPending((n) => n - 1));
  }

  async function resolveId(id: string): Promise<string> {
    const mapped = idMap.current.get(id);
    if (mapped) return mapped;
    const p = creating.current.get(id);
    if (p) {
      const real = await p;
      if (!real) throw new Error("Create failed");
      return real;
    }
    return id;
  }

  function confirmed(): Map<string, Room> {
    if (!confirmedRooms.current) confirmedRooms.current = new Map(initialRooms.map((r) => [r.id, r]));
    return confirmedRooms.current;
  }

  function schedule<P extends object>(key: string, patch: P, flush: (p: P) => void) {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing.t);
    const merged = { ...(existing?.patch ?? {}), ...patch } as Record<string, unknown>;
    const run = flush as (p: Record<string, unknown>) => void;
    const t = setTimeout(() => {
      timers.current.delete(key);
      run(merged);
    }, SAVE_DELAY_MS);
    timers.current.set(key, { patch: merged, t, flush: run });
  }

  function cancelScheduled(key: string) {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing.t);
    timers.current.delete(key);
  }

  function saveRoom(id: string, patch: RoomPatch) {
    schedule(`room:${id}`, patch, async (p: RoomPatch) => {
      try {
        const real = await resolveId(id);
        if (p.level_id) p = { ...p, level_id: await resolveId(p.level_id) };
        const saved = await track(backend.updateRoom(real, p));
        confirmed().set(saved.id, saved);
      } catch {
        const real = idMap.current.get(id) ?? id;
        const last = confirmed().get(real);
        if (last) setRooms((rs) => rs.map((r) => (r.id === id || r.id === real ? last : r)));
      }
    });
  }

  function saveOpening(id: string, patch: OpeningPatch) {
    schedule(`opening:${id}`, patch, async (p: OpeningPatch) => {
      try {
        const real = await resolveId(id);
        if (p.target_room_id) p = { ...p, target_room_id: await resolveId(p.target_room_id) };
        await track(backend.updateOpening(real, p));
      } catch {
        // error banner is shown by track(); local state stays optimistic
      }
    });
  }

  function saveLevel(id: string, patch: LevelPatch) {
    schedule(`level:${id}`, patch, async (p: LevelPatch) => {
      try {
        await track(backend.updateLevel(id, p));
      } catch {
        // banner shown
      }
    });
  }

  // ------------------------------------------------------------ derived
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const visibleRooms = useMemo(() => rooms.filter((r) => levelOf(r) === activeLevel?.id), [rooms, levelOf, activeLevel]);
  const visibleIds = useMemo(() => new Set(visibleRooms.map((r) => r.id)), [visibleRooms]);
  const belowLevel = activeLevel ? [...levels].reverse().find((l) => l.idx < activeLevel.idx) ?? null : null;
  const ghostRooms = belowLevel ? rooms.filter((r) => levelOf(r) === belowLevel.id) : [];

  const rectOf = (r: Room): Rect => {
    if (drag && (drag.kind === "move" || drag.kind === "resize") && drag.id === r.id) return drag.rect;
    return roomRect(r);
  };
  const placementRooms = (list: Room[] = visibleRooms): PlacementRoom[] => list.map((r) => ({ id: r.id, rect: roomRect(r) }));
  const linkable = (list: Opening[], roomsMap: Map<string, Room>): LinkableOpening[] =>
    list.flatMap((o) => {
      const room = roomsMap.get(o.room_id);
      if (!room) return [];
      return [{ id: o.id, room_id: o.room_id, wall: o.wall, wall_offset: o.wall_offset, widthM: openingWidthM(o, room), target_room_id: o.target_room_id }];
    });

  const selectedRoom = selection?.type === "room" ? roomById.get(selection.id) ?? null : null;
  const selectedOpening = selection?.type === "opening" ? openings.find((o) => o.id === selection.id) ?? null : null;

  // ------------------------------------------------------------ geometry commits
  function otherRects(id: string | null, levelId: string | null): Rect[] {
    return rooms.filter((r) => r.id !== id && levelOf(r) === levelId).map(roomRect);
  }

  function applyOpeningPatches(patches: Array<{ id: string; wall_offset?: number; target_room_id?: string | null }>) {
    if (patches.length === 0) return;
    setOpenings((os) =>
      os.map((o) => {
        const p = patches.find((x) => x.id === o.id);
        return p ? { ...o, ...p } : o;
      })
    );
    for (const { id, ...patch } of patches) saveOpening(id, patch);
  }

  /** Validate + apply a new rectangle for a room; returns false (and explains) if it would overlap. */
  function commitRoomRect(id: string, rect: Rect, extra: RoomPatch = {}): boolean {
    const room = roomById.get(id);
    if (!room) return false;
    const levelId = levelOf(room);
    if (overlapsAny(rect, otherRects(id, levelId))) {
      setNotice("Rooms can't overlap — move it to free space.");
      return false;
    }
    const patch: RoomPatch = { pos_x: rect.x, pos_z: rect.z, width: rect.w, depth: rect.d, level_id: levelId, ...extra };
    const nextRooms = rooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setRooms(nextRooms);
    saveRoom(id, patch);
    const nextMap = new Map(nextRooms.map((r) => [r.id, r]));
    const sameLevel = nextRooms.filter((r) => levelOf(r) === levelId);
    const placed = placementRooms(sameLevel);
    const reconciled = reconcileLinks(id, placed, linkable(openings, nextMap));
    // Then link doorways that the move put onto a newly shared wall.
    const afterReconcile = openings.map((o) => {
      const p = reconciled.find((x) => x.id === o.id);
      return p ? { ...o, ...p } : o;
    });
    const links = autoLinks(id, placed, linkable(afterReconcile, nextMap));
    const patches: Array<{ id: string; wall_offset?: number; target_room_id?: string | null }> = [...reconciled];
    const add = (p: { id: string; wall_offset?: number; target_room_id?: string | null }) => {
      const i = patches.findIndex((x) => x.id === p.id);
      if (i >= 0) patches[i] = { ...patches[i], ...p };
      else patches.push(p);
    };
    for (const l of links) {
      const source = afterReconcile.find((o) => o.id === l.openingId);
      if (!source) continue;
      add({ id: l.openingId, target_room_id: l.targetRoomId });
      if (l.partnerId) add({ id: l.partnerId, target_room_id: source.room_id, wall_offset: l.mirror.offset });
      else {
        const target = nextMap.get(l.mirror.roomId);
        if (!target) continue;
        createOpening({
          id: `tmp-opening-${++seq.current}`,
          room_id: l.mirror.roomId,
          wall: l.mirror.wall,
          wall_offset: l.mirror.offset,
          width: l.mirror.widthM / wallLength(l.mirror.wall, target),
          width_m: l.mirror.widthM,
          kind: source.kind,
          target_room_id: source.room_id,
          created_at: new Date().toISOString(),
        });
      }
    }
    applyOpeningPatches(patches);
    if (links.length > 0) {
      const names = [...new Set(links.map((l) => nextMap.get(l.targetRoomId)?.title ?? "neighbour"))].join(", ");
      setNotice(`Linked ${links.length} doorway${links.length === 1 ? "" : "s"} to ${names}`);
    }
    return true;
  }

  function createRoom(rect: Rect, opts: { title?: string; metadata?: Record<string, unknown>; select?: boolean } = {}): Room | null {
    if (!activeLevel) return null;
    const tmp = `tmp-room-${++seq.current}`;
    const title = opts.title ?? `Room ${rooms.filter((r) => palace.id === r.palace_id && !isHallway(r)).length + 1}`;
    const room: Room = {
      id: tmp,
      palace_id: palace.id,
      user_id: "",
      title,
      background: null,
      metadata: opts.metadata ?? {},
      width: rect.w,
      depth: rect.d,
      height: activeLevel.default_height,
      level_id: activeLevel.id,
      pos_x: rect.x,
      pos_z: rect.z,
      rotation: 0,
      outline: null,
      created_at: new Date().toISOString(),
    };
    setRooms((rs) => [...rs, room]);
    if (opts.select !== false) setSelection({ type: "room", id: tmp });
    const p = (async () => {
      const saved = await track(
        backend.createRoom({
          palace_id: palace.id,
          level_id: activeLevel.id,
          title,
          pos_x: rect.x,
          pos_z: rect.z,
          width: rect.w,
          depth: rect.d,
          height: activeLevel.default_height,
          ...(opts.metadata ? { metadata: opts.metadata } : {}),
        })
      );
      idMap.current.set(tmp, saved.id);
      confirmed().set(saved.id, saved);
      setRooms((rs) => rs.map((r) => (r.id === tmp ? { ...r, id: saved.id, user_id: saved.user_id, created_at: saved.created_at } : r)));
      setOpenings((os) =>
        os.map((o) => ({
          ...o,
          room_id: o.room_id === tmp ? saved.id : o.room_id,
          target_room_id: o.target_room_id === tmp ? saved.id : o.target_room_id,
        }))
      );
      setSelection((s) => (s?.type === "room" && s.id === tmp ? { type: "room", id: saved.id } : s));
      return saved.id;
    })().catch(() => {
      setRooms((rs) => rs.filter((r) => r.id !== tmp));
      setOpenings((os) => os.filter((o) => o.room_id !== tmp && o.target_room_id !== tmp));
      return null;
    });
    creating.current.set(tmp, p);
    return room;
  }

  function deleteRoom(id: string) {
    const room = roomById.get(id);
    if (!room) return;
    if (!confirm(`Delete "${room.title}" and all of its loci, cards and doors?`)) return;
    const snapshot = { rooms, openings };
    const partners = openings.filter((o) => o.target_room_id === id && o.room_id !== id);
    cancelScheduled(`room:${id}`);
    setRooms((rs) => rs.filter((r) => r.id !== id));
    setOpenings((os) => os.filter((o) => o.room_id !== id && o.target_room_id !== id));
    setSelection(null);
    void (async () => {
      try {
        const real = await resolveId(id);
        await track(backend.deleteRoom(real));
        // A door into a deleted room leads nowhere: remove the neighbour's half too.
        await Promise.all(partners.map(async (o) => track(backend.deleteOpening(await resolveId(o.id)))));
      } catch {
        setRooms(snapshot.rooms);
        setOpenings(snapshot.openings);
      }
    })();
  }

  /** Persist an optimistic (tmp-id) opening; swaps in the saved id or drops it on failure. */
  function persistOpening(o: Opening) {
    const p = (async () => {
      const roomId = await resolveId(o.room_id);
      const target = o.target_room_id ? await resolveId(o.target_room_id) : null;
      const saved = await track(
        backend.createOpening({
          room_id: roomId,
          wall: o.wall,
          wall_offset: o.wall_offset,
          width_m: o.width_m ?? DEFAULT_OPENING_WIDTH_M[o.kind],
          kind: o.kind,
          target_room_id: target,
        })
      );
      idMap.current.set(o.id, saved.id);
      setOpenings((os) => os.map((x) => (x.id === o.id ? { ...x, id: saved.id, room_id: roomId, target_room_id: target } : x)));
      setSelection((s) => (s?.type === "opening" && s.id === o.id ? { type: "opening", id: saved.id } : s));
      return saved.id;
    })().catch(() => {
      setOpenings((os) => os.filter((x) => x.id !== o.id));
      return null;
    });
    creating.current.set(o.id, p);
  }

  function createOpening(o: Opening) {
    setOpenings((os) => [...os, o]);
    persistOpening(o);
  }

  function placeOpening(plan: OpeningPlan, kind: OpeningKind, lookup: Map<string, Room> = roomById, quiet = false) {
    const room = lookup.get(plan.roomId);
    if (!room) return;
    const now = new Date().toISOString();
    const mk = (id: string, roomId: string, wall: Opening["wall"], offset: number, target: string | null): Opening => {
      const r = lookup.get(roomId)!;
      return {
        id,
        room_id: roomId,
        wall,
        wall_offset: offset,
        width: plan.widthM / wallLength(wall, r),
        width_m: plan.widthM,
        kind,
        target_room_id: target,
        created_at: now,
      };
    };
    const a = mk(`tmp-opening-${++seq.current}`, plan.roomId, plan.wall, plan.offset, plan.link?.roomId ?? null);
    const b = plan.link ? mk(`tmp-opening-${++seq.current}`, plan.link.roomId, plan.link.wall, plan.link.offset, plan.roomId) : null;
    setOpenings((os) => [...os, a, ...(b ? [b] : [])]);
    setSelection({ type: "opening", id: a.id });
    persistOpening(a);
    if (b) persistOpening(b);
    if (plan.link && !quiet) setNotice(`Linked ${kind === "door" ? "doorway" : kind} to "${lookup.get(plan.link.roomId)?.title ?? "neighbour"}"`);
  }

  // ------------------------------------------------------------ connections
  /** Is there already a linked opening between rooms a and b? */
  const linkedBetween = (a: string, b: string) => openings.some((o) => o.room_id === a && o.target_room_id === b);

  /** Doorway / archway on the wall two touching rooms share (at `at`, else the middle of the shared stretch). */
  function connectDirect(a: string, b: string, kind: OpeningKind, at?: number): boolean {
    const ra = roomById.get(a);
    if (!ra) return false;
    const same = placementRooms(visibleRooms);
    const adj = adjacentRooms(a, same).filter((x) => x.roomId === b).sort((p, q) => q.shared.to - q.shared.from - (p.shared.to - p.shared.from))[0];
    if (!adj) return false;
    const seg = wallSeg(roomRect(ra), adj.shared.wallA);
    const mid = at ?? (adj.shared.from + adj.shared.to) / 2;
    const plan = planOpening(same, a, adj.shared.wallA, mid - seg.from, Math.min(DEFAULT_OPENING_WIDTH_M[kind], adj.shared.to - adj.shared.from), at === undefined ? 0 : gridSnap);
    if (!plan?.link) return false;
    placeOpening(plan, kind);
    return true;
  }

  /** Corridor room(s) (metadata.kind = "hallway") between two rooms that don't touch, linked at both ends. */
  function connectHallway(a: string, b: string, endKind: OpeningKind): boolean {
    const ra = roomById.get(a);
    const rb = roomById.get(b);
    if (!ra || !rb || !activeLevel) return false;
    const others = visibleRooms.filter((r) => r.id !== a && r.id !== b).map(roomRect);
    const plan = planHallway(roomRect(ra), roomRect(rb), others, { width: HALLWAY_WIDTH_M, step: gridSnap });
    if (!plan) return false;
    const n = rooms.filter(isHallway).length;
    const segRooms = plan.segments.map((rect, i) =>
      createRoom(rect, { title: `Hallway ${n + i + 1}`, metadata: { ...HALLWAY_METADATA }, select: false })
    );
    if (segRooms.some((r) => !r)) return false;
    const chain: Room[] = [ra, ...(segRooms as Room[]), rb];
    const lookup = new Map(roomById);
    chain.forEach((r) => lookup.set(r.id, r));
    const placed = [...visibleRooms, ...(segRooms as Room[])].map((r) => ({ id: r.id, rect: roomRect(r) }));
    for (let i = 0; i + 1 < chain.length; i++) {
      const p = chain[i];
      const q = chain[i + 1];
      const sw = sharedStretch(roomRect(p), roomRect(q));
      if (!sw) continue;
      const end = i === 0 || i === chain.length - 2;
      const kind: OpeningKind = end ? endKind : "archway";
      // Ends get a standard doorway/archway; the bend between two corridor
      // pieces is left fully open.
      const width = end ? DEFAULT_OPENING_WIDTH_M[kind] : Math.min(HALLWAY_WIDTH_M, sw.to - sw.from);
      const seg = wallSeg(roomRect(p), sw.wallA);
      const op = planOpening(placed, p.id, sw.wallA, (sw.from + sw.to) / 2 - seg.from, width, 0);
      if (op?.link) placeOpening(op, kind, lookup, true);
    }
    setSelection({ type: "room", id: (segRooms[0] as Room).id });
    setNotice(`Hallway added (${fmtM(plan.length)}) between "${ra.title}" and "${rb.title}"`);
    return true;
  }

  function connect(kind: ConnectKind) {
    if (!chooser) return;
    const { a, b, at } = chooser;
    const ok = kind === "hallway" || kind === "hallway-door" ? connectHallway(a, b, kind === "hallway" ? "archway" : "door") : connectDirect(a, b, kind, at);
    if (!ok) setNotice(kind.startsWith("hallway") ? "No free straight or L-shaped path for a hallway. Move a room and try again." : "Those rooms don't share a wall.");
    setChooser(null);
    setConnectFirst(null);
    setTool("select");
  }

  /** Start the chooser for a pair of rooms. */
  function openChooser(a: string, b: string, at?: number) {
    setChooser({ a, b, at });
    setConnectFirst(null);
  }

  function deleteOpening(id: string) {
    const op = openings.find((o) => o.id === id);
    if (!op) return;
    const partner = findPartner(op, openings);
    const ids = [op.id, ...(partner ? [partner.id] : [])];
    const snapshot = openings;
    ids.forEach((x) => cancelScheduled(`opening:${x}`));
    setOpenings((os) => os.filter((o) => !ids.includes(o.id)));
    setSelection(null);
    void (async () => {
      try {
        await Promise.all(ids.map(async (x) => track(backend.deleteOpening(await resolveId(x)))));
      } catch {
        setOpenings(snapshot);
      }
    })();
  }

  /** Move an opening along its wall (offset 0..1) and keep its linked partner aligned or unlink it. */
  function moveOpening(op: Opening, offset: number, widthM?: number) {
    const room = roomById.get(op.room_id);
    if (!room) return;
    const len = wallLength(op.wall, room);
    const width = Math.min(widthM ?? openingWidthM(op, room), len);
    const half = width / len / 2;
    const next = Math.min(1 - half, Math.max(half, offset));
    const patches: Array<{ id: string; wall_offset?: number; target_room_id?: null; width_m?: number; width?: number }> = [
      { id: op.id, wall_offset: next, ...(widthM !== undefined ? { width_m: width, width: width / len } : {}) },
    ];
    const partner = findPartner(op, openings);
    if (op.target_room_id) {
      const link = findLinkTarget(placementRooms(rooms.filter((r) => levelOf(r) === levelOf(room))), op.room_id, op.wall, next, width);
      if (link && link.roomId === op.target_room_id) {
        if (partner) {
          const pRoom = roomById.get(partner.room_id);
          patches.push({ id: partner.id, wall_offset: link.offset, ...(widthM !== undefined && pRoom ? { width_m: width, width: width / wallLength(partner.wall, pRoom) } : {}) });
        }
      } else {
        patches[0].target_room_id = null;
        if (partner) patches.push({ id: partner.id, target_room_id: null });
        setNotice("Door no longer on the shared wall — unlinked.");
      }
    }
    setOpenings((os) => os.map((o) => ({ ...o, ...(patches.find((p) => p.id === o.id) ?? {}), id: o.id })));
    for (const { id, width: _w, ...patch } of patches) {
      void _w;
      saveOpening(id, patch);
    }
  }

  // ------------------------------------------------------------ levels
  async function addLevel() {
    const top = levels[levels.length - 1];
    try {
      const level = await track(
        backend.createLevel({
          palace_id: palace.id,
          name: top ? `Level ${levels.length}` : "Ground",
          idx: top ? top.idx + 1 : 0,
          // Standard storeys: level n sits n * 3 m up (adjustable under Advanced).
          elevation: (top ? top.idx + 1 : 0) * STANDARD_HEIGHT_M,
          default_height: STANDARD_HEIGHT_M,
        })
      );
      setLevels((ls) => [...ls, level].sort(byIdx));
      setActiveLevelId(level.id);
      setSelection(null);
    } catch {
      // banner shown
    }
  }

  function renameLevel(id: string, name: string) {
    if (!name.trim()) return;
    setLevels((ls) => ls.map((l) => (l.id === id ? { ...l, name } : l)));
    saveLevel(id, { name: name.trim() });
  }

  function updateLevelHeight(id: string, patch: { elevation?: number; default_height?: number }) {
    setLevels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    saveLevel(id, patch);
  }

  /** Reorder by swapping idx (and elevation, so floors stay stacked in order) with the neighbour. */
  function moveLevel(id: string, dir: -1 | 1) {
    const i = levels.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= levels.length) return;
    const a = levels[i];
    const b = levels[j];
    const na = { ...a, idx: b.idx, elevation: b.elevation };
    const nb = { ...b, idx: a.idx, elevation: a.elevation };
    setLevels((ls) => ls.map((l) => (l.id === a.id ? na : l.id === b.id ? nb : l)).sort(byIdx));
    saveLevel(a.id, { idx: na.idx, elevation: na.elevation });
    saveLevel(b.id, { idx: nb.idx, elevation: nb.elevation });
  }

  function deleteLevel(id: string) {
    if (levels.length <= 1) return;
    const level = levels.find((l) => l.id === id);
    if (!level) return;
    const doomed = rooms.filter((r) => levelOf(r) === id).map((r) => r.id);
    if (!confirm(`Delete level "${level.name}"${doomed.length ? ` and its ${doomed.length} room(s) with all loci and cards` : ""}?`)) return;
    const snapshot = { levels, rooms, openings };
    setLevels((ls) => ls.filter((l) => l.id !== id));
    setRooms((rs) => rs.filter((r) => !doomed.includes(r.id)));
    setOpenings((os) => os.filter((o) => !doomed.includes(o.room_id) && !(o.target_room_id && doomed.includes(o.target_room_id))));
    setActiveLevelId(levels.find((l) => l.id !== id)?.id ?? null);
    setSelection(null);
    void track(backend.deleteLevel(id)).catch(() => {
      setLevels(snapshot.levels);
      setRooms(snapshot.rooms);
      setOpenings(snapshot.openings);
    });
  }

  function changeSnap(step: number) {
    setGridSnap(step);
    try {
      localStorage.setItem(snapKey(palace.id), String(step));
    } catch {
      // ignore
    }
    void track(backend.updatePalace(palace.id, { grid_snap: step })).catch(() => undefined);
  }

  // ------------------------------------------------------------ pointer + keyboard
  function toWorld(e: { clientX: number; clientY: number }): Pt {
    const svg = svgRef.current;
    if (!svg) return { x: 0, z: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: view.cx + (e.clientX - rect.left - rect.width / 2) / view.ppm,
      z: view.cz - (e.clientY - rect.top - rect.height / 2) / view.ppm,
    };
  }

  /** Magnetic snap distance in metres (about MAGNET_PX on screen, never more than 0.45 m). */
  const magnet = Math.min(0.45, MAGNET_PX / view.ppm);
  const NO_GUIDES: SnapGuides = { x: [], z: [] };

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    containerRef.current?.focus({ preventScroll: true });
    const p = toWorld(e);
    const target = e.target as Element;
    const startPan = () => setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, cx: view.cx, cz: view.cz });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault();
      startPan();
      return;
    }
    if (e.button !== 0) return;
    if (!activeLevel) return;
    if (tool === "room") {
      setSelection(null);
      setDrag({ kind: "draw", a: p, b: p });
      return;
    }
    if (tool === "connect") {
      const id = target.closest("[data-room-id]")?.getAttribute("data-room-id");
      if (!id) {
        setConnectFirst(null);
        startPan();
        return;
      }
      if (!connectFirst || connectFirst === id) {
        setConnectFirst(id);
        setSelection({ type: "room", id });
      } else openChooser(connectFirst, id);
      return;
    }
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle") as Handle | null | undefined;
    if (handle && selectedRoom) {
      const orig = roomRect(selectedRoom);
      setDrag({ kind: "resize", id: selectedRoom.id, handle, orig, rect: orig, guides: NO_GUIDES });
      return;
    }
    const openingId = target.closest("[data-opening-id]")?.getAttribute("data-opening-id");
    if (openingId) {
      setSelection({ type: "opening", id: openingId });
      return;
    }
    const roomId = target.closest("[data-room-id]")?.getAttribute("data-room-id");
    const room = roomId ? roomById.get(roomId) : undefined;
    if (room) {
      setSelection({ type: "room", id: room.id });
      const orig = roomRect(room);
      setDrag({ kind: "move", id: room.id, start: p, orig, rect: orig, guides: NO_GUIDES });
      return;
    }
    setSelection(null);
    startPan();
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = toWorld(e);
    setCursor(p);
    if (!drag) return;
    switch (drag.kind) {
      case "pan":
        setView((v) => ({ ...v, cx: drag.cx - (e.clientX - drag.sx) / v.ppm, cz: drag.cz + (e.clientY - drag.sy) / v.ppm }));
        break;
      case "draw":
        setDrag({ ...drag, b: p });
        break;
      case "move": {
        const room = roomById.get(drag.id);
        const others = otherRects(drag.id, room ? levelOf(room) : null);
        const r = snapMove(drag.orig, p.x - drag.start.x, p.z - drag.start.z, gridSnap, others, magnet);
        setDrag({ ...drag, rect: r.rect, guides: r.guides });
        break;
      }
      case "resize": {
        const room = roomById.get(drag.id);
        const others = otherRects(drag.id, room ? levelOf(room) : null);
        const r = snapResize(drag.orig, drag.handle, p, gridSnap, minSize, others, magnet);
        setDrag({ ...drag, rect: r.rect, guides: r.guides });
        break;
      }
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "draw") {
      const { rect } = snapDraw(d.a, d.b, gridSnap, minSize, otherRects(null, activeLevel?.id ?? null), magnet);
      if (!rect) return;
      if (overlapsAny(rect, otherRects(null, activeLevel?.id ?? null))) {
        setNotice("Rooms can't overlap — draw it in free space.");
        return;
      }
      createRoom(rect);
    } else if (d.kind === "move" || d.kind === "resize") {
      const same = d.rect.x === d.orig.x && d.rect.z === d.orig.z && d.rect.w === d.orig.w && d.rect.d === d.orig.d;
      if (!same) commitRoomRect(d.id, d.rect);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("input,textarea,select")) return;
    // Let Enter/Space activate focused buttons and links normally.
    if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement).closest("button,a")) return;
    const key = e.key;
    if (key === "Escape") {
      e.preventDefault();
      if (drag) setDrag(null);
      else if (chooser) setChooser(null);
      else if (connectFirst) setConnectFirst(null);
      else {
        setTool("select");
        setSelection(null);
      }
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      if (selection?.type === "room") deleteRoom(selection.id);
      else if (selection?.type === "opening") deleteOpening(selection.id);
      return;
    }
    if (key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? 1 : gridSnap;
      const dx = key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0;
      const dz = key === "ArrowUp" ? step : key === "ArrowDown" ? -step : 0; // up = north = +z
      if (selectedRoom) {
        commitRoomRect(selectedRoom.id, moveRect(roomRect(selectedRoom), dx, dz, gridSnap));
      } else if (selectedOpening) {
        const room = roomById.get(selectedOpening.room_id);
        if (!room) return;
        const horizontal = selectedOpening.wall === "north" || selectedOpening.wall === "south";
        const delta = horizontal ? dx : dz;
        if (delta !== 0) moveOpening(selectedOpening, selectedOpening.wall_offset + delta / wallLength(selectedOpening.wall, room));
      }
      return;
    }
    const shortcuts: Record<string, Tool> = { v: "select", r: "room", c: "connect" };
    const t = shortcuts[key.toLowerCase()];
    if (t && !e.metaKey && !e.ctrlKey && !e.altKey) pickTool(t);
  }

  function zoom(factor: number) {
    setView((v) => ({ ...v, ppm: Math.min(MAX_PPM, Math.max(MIN_PPM, v.ppm * factor)) }));
  }

  // ------------------------------------------------------------ render helpers
  const px = (n: number) => n / view.ppm; // screen px -> metres
  const vw = size.w / view.ppm;
  const vh = size.h / view.ppm;
  const vx = view.cx - vw / 2;
  const vy = -view.cz - vh / 2;

  let minor = gridSnap;
  while (minor * view.ppm < 8) minor *= 2;
  const major = view.ppm >= 16 ? 1 : 5;
  const xLines = gridLines(vx, vx + vw, minor);
  const zLines = gridLines(-(vy + vh), -vy, minor);
  const isMajor = (v: number) => Math.abs(v / major - Math.round(v / major)) < 1e-6;

  const drawSnap = drag?.kind === "draw" ? snapDraw(drag.a, drag.b, gridSnap, minSize, otherRects(null, activeLevel?.id ?? null), magnet) : null;
  const drawRect = drawSnap?.rect ?? null;
  const guides: SnapGuides = drawSnap?.guides ?? (drag && (drag.kind === "move" || drag.kind === "resize") ? drag.guides : NO_GUIDES);
  const drawInvalid = drawRect ? overlapsAny(drawRect, otherRects(null, activeLevel?.id ?? null)) : false;
  const dragRect = drag && (drag.kind === "move" || drag.kind === "resize") ? drag.rect : null;
  const dragRoom = drag && (drag.kind === "move" || drag.kind === "resize") ? roomById.get(drag.id) : undefined;
  const dragInvalid = dragRoom && dragRect ? overlapsAny(dragRect, otherRects(dragRoom.id, levelOf(dragRoom))) : false;
  const dimsRect = drawRect ?? dragRect;
  const dimsInvalid = drawRect ? drawInvalid : dragInvalid;

  /** Quarter-circle door swing (cubic approximation), hinged at the opening's start, opening into the room. */
  function doorSwing(o: Opening, rect: Rect, room: Room): string {
    const s = wallSeg(rect, o.wall);
    const w = openingWidthM(o, room);
    const c = s.from + o.wall_offset * (s.to - s.from);
    const inward: Pt = o.wall === "north" ? { x: 0, z: -1 } : o.wall === "south" ? { x: 0, z: 1 } : o.wall === "east" ? { x: -1, z: 0 } : { x: 1, z: 0 };
    const at = (v: number): Pt => (s.axis === "x" ? { x: v, z: s.fixed } : { x: s.fixed, z: v });
    const hinge = at(c - w / 2);
    const closed = at(c + w / 2);
    const open = { x: hinge.x + inward.x * w, z: hinge.z + inward.z * w };
    const k = 0.5523;
    const c1 = { x: closed.x + inward.x * w * k, z: closed.z + inward.z * w * k };
    const c2 = { x: open.x + (closed.x - hinge.x) * k, z: open.z + (closed.z - hinge.z) * k };
    const P = (p: Pt) => `${p.x} ${-p.z}`;
    return `M ${P(hinge)} L ${P(open)} M ${P(closed)} C ${P(c1)} ${P(c2)} ${P(open)}`;
  }

  /** World -> pixel position inside the canvas (for HTML overlays). */
  const toScreen = (p: Pt) => ({ left: (p.x - vx) * view.ppm, top: (-p.z - vy) * view.ppm });

  /** Unlinked neighbours of the selected room that share a wall: contextual "+" connect badges. */
  const connectBadges = (() => {
    const base = tool === "connect" ? (connectFirst ? roomById.get(connectFirst) : null) : selectedRoom;
    if (!base || drag || chooser || !visibleIds.has(base.id)) return [];
    const seen = new Set<string>();
    const out: Array<{ a: string; b: string; at: number; pos: Pt; title: string }> = [];
    for (const adj of adjacentRooms(base.id, placementRooms(visibleRooms)).sort((p, q) => q.shared.to - q.shared.from - (p.shared.to - p.shared.from))) {
      if (seen.has(adj.roomId) || linkedBetween(base.id, adj.roomId)) continue;
      seen.add(adj.roomId);
      const seg = wallSeg(roomRect(base), adj.shared.wallA);
      const at = (adj.shared.from + adj.shared.to) / 2;
      const pos = seg.axis === "x" ? { x: at, z: seg.fixed } : { x: seg.fixed, z: at };
      out.push({ a: base.id, b: adj.roomId, at, pos, title: roomById.get(adj.roomId)?.title ?? "room" });
    }
    return out;
  })();

  const chooserInfo = (() => {
    if (!chooser) return null;
    const ra = roomById.get(chooser.a);
    const rb = roomById.get(chooser.b);
    if (!ra || !rb) return null;
    const adjacent = adjacentRooms(ra.id, placementRooms(visibleRooms)).some((x) => x.roomId === rb.id);
    const others = visibleRooms.filter((r) => r.id !== ra.id && r.id !== rb.id).map(roomRect);
    const hall = adjacent ? null : planHallway(roomRect(ra), roomRect(rb), others, { width: HALLWAY_WIDTH_M, step: gridSnap });
    const A = roomRect(ra);
    const B = roomRect(rb);
    let pos: Pt = { x: (A.x + A.w / 2 + B.x + B.w / 2) / 2, z: (A.z + A.d / 2 + B.z + B.d / 2) / 2 };
    if (adjacent && chooser.at !== undefined) {
      const sw = sharedStretch(A, B);
      if (sw) pos = wallSeg(A, sw.wallA).axis === "x" ? { x: chooser.at, z: wallSeg(A, sw.wallA).fixed } : { x: wallSeg(A, sw.wallA).fixed, z: chooser.at };
    }
    return { ra, rb, adjacent, hall, pos, linked: linkedBetween(ra.id, rb.id) };
  })();

  function openingSegment(o: Opening, rect: Rect, room: Room) {
    const s = wallSeg(rect, o.wall);
    const w = openingWidthM(o, room);
    const c = s.from + o.wall_offset * (s.to - s.from);
    return s.axis === "x"
      ? { x1: c - w / 2, y1: -s.fixed, x2: c + w / 2, y2: -s.fixed }
      : { x1: s.fixed, y1: -(c - w / 2), x2: s.fixed, y2: -(c + w / 2) };
  }

  const cursorStyle =
    drag?.kind === "pan"
      ? "grabbing"
      : drag?.kind === "resize"
        ? HANDLE_CURSOR[drag.handle]
        : tool === "room"
          ? "crosshair"
          : tool === "connect"
            ? "pointer"
            : "default";

  function pickTool(t: Tool) {
    setTool(t);
    setConnectFirst(t === "connect" && selectedRoom ? selectedRoom.id : null);
    setChooser(null);
  }

  const toolBtn = (t: Tool, label: string, hint: string) => (
    <button
      key={t}
      onClick={() => {
        pickTool(t);
        containerRef.current?.focus({ preventScroll: true });
      }}
      title={hint}
      aria-pressed={tool === t}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        tool === t ? "bg-primary text-primary-foreground" : "card-base hover:border-primary/60"
      }`}
    >
      {label}
    </button>
  );

  // ------------------------------------------------------------ render
  if (levels.length === 0) {
    return (
      <div className="card-base p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">This palace has no levels yet.</p>
        <button onClick={addLevel} className="btn-primary">
          Create ground level
        </button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]" onKeyDown={onKeyDown}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {toolBtn("select", "Select", "Select / move / resize (V)")}
          {toolBtn("room", "Draw room", "Drag a rectangle to draw a room (R)")}
          {toolBtn("connect", "Connect rooms", "Click one room, then another, to add an archway, doorway or hallway (C)")}
          <span className="mx-1 h-6 w-px bg-border" />
          <button onClick={() => zoom(1.25)} className="btn-ghost !px-2" aria-label="Zoom in">
            +
          </button>
          <button onClick={() => zoom(0.8)} className="btn-ghost !px-2" aria-label="Zoom out">
            −
          </button>
          <button onClick={() => setView(fitView(visibleRooms, size.w, size.h))} className="btn-ghost !px-2">
            Fit
          </button>
          <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
            Snap
            <select value={gridSnap} onChange={(e) => changeSnap(Number(e.target.value))} className="input-base !w-20 !py-1 text-xs" aria-label="Grid snap">
              {[...new Set([...SNAP_CHOICES, gridSnap])].sort((a, b) => a - b).map((s) => (
                <option key={s} value={s}>
                  {s} m
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {pending > 0 ? "Saving…" : error ? "" : "All changes saved"}
          </span>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-1" role="tablist" aria-label="Levels">
          {[...levels].reverse().map((l) => (
            <span
              key={l.id}
              role="tab"
              aria-selected={l.id === activeLevel?.id}
              className={`inline-flex items-center rounded-t-lg border-b-2 ${
                l.id === activeLevel?.id ? "border-primary" : "border-transparent"
              }`}
            >
              <button
                onClick={() => {
                  setActiveLevelId(l.id);
                  setSelection(null);
                }}
                className={`px-3 py-1.5 text-sm ${
                  l.id === activeLevel?.id ? "font-semibold text-link" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.name}
              </button>
              {levels.length > 1 && (
                <button
                  onClick={() => deleteLevel(l.id)}
                  className="mr-1 rounded px-1 text-xs text-muted-foreground hover:text-destructive"
                  title={`Delete ${l.name} and its rooms`}
                  aria-label={`Delete ${l.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <button
            onClick={addLevel}
            className="rounded-lg border border-dashed border-primary/60 px-3 py-1.5 text-sm font-medium text-link transition-colors hover:bg-primary/10"
            title="Add a level above the top one"
          >
            + Add level
          </button>
        </div>

        <div
          ref={containerRef}
          tabIndex={0}
          className="relative h-[560px] overflow-hidden rounded-lg border border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Palace grid editor. North is up. Arrow keys nudge, Delete removes, Escape cancels."
        >
          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            viewBox={`${vx} ${vy} ${vw} ${vh}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onPointerLeave={() => setCursor(null)}
            onContextMenu={(e) => e.preventDefault()}
            className="block touch-none select-none"
            style={{ cursor: cursorStyle }}
          >
            {/* grid */}
            <g>
              {xLines.map((x) => (
                <line key={`x${x}`} x1={x} x2={x} y1={vy} y2={vy + vh} stroke="var(--foreground)" strokeOpacity={x === 0 ? 0.35 : isMajor(x) ? 0.14 : 0.05} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {zLines.map((z) => (
                <line key={`z${z}`} x1={vx} x2={vx + vw} y1={-z} y2={-z} stroke="var(--foreground)" strokeOpacity={z === 0 ? 0.35 : isMajor(z) ? 0.14 : 0.05} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
            </g>

            <defs>
              <pattern id="mp-hallway-stripes" width={0.5} height={0.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={0.5} height={0.5} fill="var(--card)" />
                <rect width={0.18} height={0.5} fill="var(--primary)" fillOpacity={0.16} />
              </pattern>
            </defs>

            {/* level below, for alignment */}
            {ghostRooms.map((r) => (
              <rect key={`ghost-${r.id}`} x={r.pos_x} y={-(r.pos_z + r.depth)} width={r.width} height={r.depth} fill="none" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.6} pointerEvents="none" />
            ))}

            {/* rooms */}
            {visibleRooms.map((r) => {
              const rect = rectOf(r);
              const sel = (selection?.type === "room" && selection.id === r.id) || selectedRoomId === r.id;
              const invalid = dragRect && drag && "id" in drag && drag.id === r.id && dragInvalid;
              const hall = isHallway(r);
              const picked = tool === "connect" && (connectFirst === r.id || chooser?.a === r.id || chooser?.b === r.id);
              return (
                <g key={r.id} data-room-id={r.id} style={{ cursor: tool === "select" ? "move" : undefined }}>
                  <rect
                    x={rect.x}
                    y={-(rect.z + rect.d)}
                    width={rect.w}
                    height={rect.d}
                    fill={hall ? "url(#mp-hallway-stripes)" : "var(--card)"}
                    fillOpacity={0.95}
                    stroke={invalid ? "var(--destructive)" : sel || picked ? "var(--primary)" : "var(--muted-foreground)"}
                    strokeWidth={sel || picked ? 3 : hall ? 1.5 : 2}
                    strokeDasharray={hall && !sel ? "6 3" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                  {r.background && (
                    <rect x={rect.x} y={-(rect.z + rect.d)} width={rect.w} height={rect.d} fill={r.background} fillOpacity={0.22} pointerEvents="none" />
                  )}
                  {hall ? (
                    <text
                      x={rect.x + rect.w / 2}
                      y={-(rect.z + rect.d / 2) + px(4)}
                      textAnchor="middle"
                      fontSize={px(11)}
                      fontWeight={600}
                      fill="var(--muted-foreground)"
                      letterSpacing={px(1)}
                      transform={rect.d > rect.w ? `rotate(-90 ${rect.x + rect.w / 2} ${-(rect.z + rect.d / 2)})` : undefined}
                      pointerEvents="none"
                    >
                      HALLWAY
                    </text>
                  ) : (
                  <text x={rect.x + rect.w / 2} y={-(rect.z + rect.d / 2)} textAnchor="middle" fontSize={px(13)} fontWeight={600} fill="var(--foreground)" pointerEvents="none">
                    {r.title}
                  </text>
                  )}
                  {!hall && <text x={rect.x + rect.w / 2} y={-(rect.z + rect.d / 2) + px(15)} textAnchor="middle" fontSize={px(11)} fill="var(--muted-foreground)" pointerEvents="none">
                    {fmtM(rect.w)} × {fmtM(rect.d)}
                  </text>}
                </g>
              );
            })}

            {/* openings */}
            {openings.map((o) => {
              const room = roomById.get(o.room_id);
              if (!room || !visibleIds.has(room.id)) return null;
              const seg = openingSegment(o, rectOf(room), room);
              const sel = selection?.type === "opening" && selection.id === o.id;
              const color = o.kind === "door" ? "var(--accent)" : "var(--primary)";
              return (
                <g key={o.id} data-opening-id={o.id} style={{ cursor: "pointer" }}>
                  <line {...seg} stroke="var(--background)" strokeWidth={7} vectorEffect="non-scaling-stroke" />
                  <line {...seg} stroke={color} strokeWidth={sel ? 6 : 4} strokeDasharray={o.target_room_id ? undefined : "5 3"} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  {o.kind === "door" && (!o.target_room_id || o.room_id < o.target_room_id) && (
                    <path d={doorSwing(o, rectOf(room), room)} fill="none" stroke={color} strokeOpacity={0.7} strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  )}
                  <line {...seg} stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}

            {/* snap guides: an edge lined up with another room's edge (or the grid while snapping) */}
            {(guides.x.length > 0 || guides.z.length > 0) && (
              <g pointerEvents="none">
                {guides.x.map((x) => (
                  <line key={`gx${x}`} x1={x} x2={x} y1={vy} y2={vy + vh} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                ))}
                {guides.z.map((z) => (
                  <line key={`gz${z}`} x1={vx} x2={vx + vw} y1={-z} y2={-z} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )}

            {/* draw preview */}
            {drawRect && (
              <rect x={drawRect.x} y={-(drawRect.z + drawRect.d)} width={drawRect.w} height={drawRect.d} fill={drawInvalid ? "var(--destructive)" : "var(--primary)"} fillOpacity={0.12} stroke={drawInvalid ? "var(--destructive)" : "var(--primary)"} strokeDasharray="6 4" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}

            {/* resize handles */}
            {selectedRoom && tool === "select" && visibleIds.has(selectedRoom.id) &&
              HANDLES.map((h) => {
                const p = handlePos(rectOf(selectedRoom), h);
                const s = px(10);
                return (
                  <rect key={h} data-handle={h} x={p.x - s / 2} y={-p.z - s / 2} width={s} height={s} fill="var(--card)" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: HANDLE_CURSOR[h] }} />
                );
              })}

            {/* live dimensions */}
            {dimsRect && (
              <g pointerEvents="none">
                <text x={dimsRect.x + dimsRect.w / 2} y={-(dimsRect.z + dimsRect.d) - px(8)} textAnchor="middle" fontSize={px(12)} fontWeight={700} fill={dimsInvalid ? "var(--destructive)" : "var(--primary)"}>
                  {fmtM(dimsRect.w)}
                </text>
                <text x={dimsRect.x + dimsRect.w + px(8)} y={-(dimsRect.z + dimsRect.d / 2)} fontSize={px(12)} fontWeight={700} fill={dimsInvalid ? "var(--destructive)" : "var(--primary)"}>
                  {fmtM(dimsRect.d)}
                </text>
                <text x={dimsRect.x} y={-dimsRect.z + px(16)} fontSize={px(10)} fill="var(--muted-foreground)">
                  ({fmtM(dimsRect.x)}, {fmtM(dimsRect.z)}){dimsInvalid ? " — overlaps" : ""}
                </text>
              </g>
            )}
          </svg>

          {connectBadges.map((b) => (
            <button
              key={`${b.a}-${b.b}`}
              type="button"
              onClick={() => openChooser(b.a, b.b, b.at)}
              title={`Connect to ${b.title}`}
              aria-label={`Connect to ${b.title}`}
              className="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-sm font-bold leading-none text-primary-foreground shadow ring-2 ring-background transition-transform hover:scale-110"
              style={toScreen(b.pos)}
            >
              +
            </button>
          ))}
          {chooserInfo && (
            <ConnectChooser
              info={chooserInfo}
              style={(() => {
                const sp = toScreen(chooserInfo.pos);
                return { left: Math.min(Math.max(sp.left, 130), size.w - 130), top: Math.min(Math.max(sp.top, 20), size.h - 200) };
              })()}
              onPick={connect}
              onCancel={() => setChooser(null)}
            />
          )}
          {tool === "connect" && !chooser && (
            <div className="pointer-events-none absolute bottom-9 left-1/2 -translate-x-1/2 rounded-md bg-card/95 px-3 py-1 text-xs shadow">
              {connectFirst ? `Now click the room to connect "${roomById.get(connectFirst)?.title ?? ""}" to (or a + badge)` : "Click the first room to connect"}
            </div>
          )}
          <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-center rounded-md bg-card/90 px-2 py-1 text-xs font-semibold shadow-sm">
            <span aria-hidden>▲</span>N
          </div>
          <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-card/90 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {cursor ? `x ${cursor.x.toFixed(2)}  z ${cursor.z.toFixed(2)} m` : "—"} · {activeLevel?.name} · {Math.round(view.ppm)} px/m
          </div>
          {notice && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-foreground px-3 py-1 text-xs text-background shadow">
              {notice}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-2 text-sm text-destructive">
            {error}{" "}
            <button onClick={() => setError(null)} className="underline">
              dismiss
            </button>
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          R draw a room (edges snap to the grid and to nearby rooms) · C connect rooms · V select · Arrows nudge (Shift = 1 m) ·
          Delete removes · Esc cancels. Drag empty space to pan, wheel to zoom. Select a room and use the + badges to connect it to
          a touching room.
        </p>
      </div>

      <aside className="space-y-4">
        {activeLevel && (
          <LevelPanel
            key={`${activeLevel.id}:${activeLevel.name}:${activeLevel.elevation}:${activeLevel.default_height}`}
            level={activeLevel}
            canDelete={levels.length > 1}
            isFirst={levels[0]?.id === activeLevel.id}
            isLast={levels[levels.length - 1]?.id === activeLevel.id}
            onRename={(name) => renameLevel(activeLevel.id, name)}
            onHeights={(patch) => updateLevelHeight(activeLevel.id, patch)}
            onMove={(dir) => moveLevel(activeLevel.id, dir)}
            onDelete={() => deleteLevel(activeLevel.id)}
          />
        )}

        {selectedRoom && (
          <RoomPanel
            key={`${selectedRoom.id}:${selectedRoom.title}:${selectedRoom.pos_x}:${selectedRoom.pos_z}:${selectedRoom.width}:${selectedRoom.depth}:${selectedRoom.height}`}
            room={selectedRoom}
            saved={!isTemp(selectedRoom.id)}
            onRename={(title) => {
              setRooms((rs) => rs.map((r) => (r.id === selectedRoom.id ? { ...r, title } : r)));
              saveRoom(selectedRoom.id, { title });
            }}
            onGeometry={(rect, height) => commitRoomRect(selectedRoom.id, rect, height !== selectedRoom.height ? { height } : {})}
            onTheme={(background) => {
              setRooms((rs) => rs.map((r) => (r.id === selectedRoom.id ? { ...r, background } : r)));
              saveRoom(selectedRoom.id, { background });
            }}
            onDelete={() => deleteRoom(selectedRoom.id)}
            onPreview={onPreviewRoom ? () => onPreviewRoom(selectedRoom.id) : undefined}
            neighbours={connectBadges.filter((b) => b.a === selectedRoom.id).map((b) => ({ id: b.b, title: b.title }))}
            links={openings
              .filter((o) => o.room_id === selectedRoom.id && o.target_room_id)
              .map((o) => ({ id: o.id, kind: o.kind, title: roomById.get(o.target_room_id!)?.title ?? "room" }))}
            onConnect={(id) => {
              const b = connectBadges.find((x) => x.a === selectedRoom.id && x.b === id);
              openChooser(selectedRoom.id, id, b?.at);
            }}
            onConnectOther={() => {
              setTool("connect");
              setConnectFirst(selectedRoom.id);
              setChooser(null);
              containerRef.current?.focus({ preventScroll: true });
            }}
          />
        )}

        {selectedOpening && (
          <OpeningPanel
            key={`${selectedOpening.id}:${selectedOpening.width_m}:${selectedOpening.kind}`}
            opening={selectedOpening}
            room={roomById.get(selectedOpening.room_id) ?? null}
            target={selectedOpening.target_room_id ? roomById.get(selectedOpening.target_room_id) ?? null : null}
            onKind={(kind) => {
              const partner = findPartner(selectedOpening, openings);
              const ids = [selectedOpening.id, ...(partner ? [partner.id] : [])];
              setOpenings((os) => os.map((o) => (ids.includes(o.id) ? { ...o, kind } : o)));
              ids.forEach((id) => saveOpening(id, { kind }));
            }}
            onWidth={(w) => moveOpening(selectedOpening, selectedOpening.wall_offset, w)}
            onDelete={() => deleteOpening(selectedOpening.id)}
          />
        )}

        {!selectedRoom && !selectedOpening && (
          <div className="card-base p-4 text-sm text-muted-foreground">
            Select a room or door to edit it. {visibleRooms.length === 0 ? "Press R and drag on the grid to draw the first room on this level." : ""}
          </div>
        )}
      </aside>
    </div>
  );
}

// ------------------------------------------------------------ inspector panels
function NumField({ label, value, onChange, step = 0.5, min }: { label: string; value: string; onChange: (v: string) => void; step?: number; min?: number }) {
  return (
    <label className="flex flex-col text-xs text-muted-foreground">
      {label}
      <input type="number" step={step} min={min} value={value} onChange={(e) => onChange(e.target.value)} className="input-base !px-2 !py-1 text-sm" />
    </label>
  );
}

function LevelPanel({
  level,
  canDelete,
  isFirst,
  isLast,
  onRename,
  onHeights,
  onMove,
  onDelete,
}: {
  level: Level;
  canDelete: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRename: (name: string) => void;
  onHeights: (patch: { elevation?: number; default_height?: number }) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(level.name);
  const [elev, setElev] = useState(String(level.elevation));
  const [height, setHeight] = useState(String(level.default_height));
  const apply = () => {
    if (name.trim() && name !== level.name) onRename(name.trim());
    const e = Number(elev);
    const h = Number(height);
    const patch: { elevation?: number; default_height?: number } = {};
    if (Number.isFinite(e) && e !== level.elevation) patch.elevation = e;
    if (Number.isFinite(h) && h > 0 && h !== level.default_height) patch.default_height = h;
    if (Object.keys(patch).length) onHeights(patch);
  };
  return (
    <div className="card-base space-y-2 p-4">
      <h3 className="text-sm font-semibold">Level</h3>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()} className="input-base text-sm" aria-label="Level name" />
      <p className="text-xs text-muted-foreground">
        Standard storey: rooms {fmtM(level.default_height)} tall, floor at {fmtM(level.elevation)}.
      </p>
      <details className="group text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Advanced</summary>
        <div className="mt-2 grid grid-cols-2 gap-2" onBlur={apply}>
          <NumField label="Elevation (m)" value={elev} onChange={setElev} />
          <NumField label="Room height (m)" value={height} onChange={setHeight} min={0.5} />
        </div>
      </details>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <button onClick={() => onMove(1)} disabled={isLast} className="btn-ghost !px-2 !py-1 text-xs" title="Move this level up">
          ↑ Up
        </button>
        <button onClick={() => onMove(-1)} disabled={isFirst} className="btn-ghost !px-2 !py-1 text-xs" title="Move this level down">
          ↓ Down
        </button>
        <button onClick={onDelete} disabled={!canDelete} className="btn-danger ml-auto !px-2 !py-1 text-xs" title={canDelete ? "Delete level" : "A palace needs at least one level"}>
          Delete level
        </button>
      </div>
    </div>
  );
}

function RoomPanel({
  room,
  saved,
  onRename,
  onGeometry,
  onTheme,
  onDelete,
  onPreview,
  neighbours,
  links,
  onConnect,
  onConnectOther,
}: {
  room: Room;
  saved: boolean;
  onRename: (title: string) => void;
  onGeometry: (rect: Rect, height: number) => boolean;
  onTheme: (bg: string | null) => void;
  onDelete: () => void;
  onPreview?: () => void;
  /** Touching rooms that aren't connected yet. */
  neighbours: Array<{ id: string; title: string }>;
  /** Existing linked openings from this room. */
  links: Array<{ id: string; kind: OpeningKind; title: string }>;
  onConnect: (roomId: string) => void;
  onConnectOther: () => void;
}) {
  const [title, setTitle] = useState(room.title);
  const [x, setX] = useState(String(room.pos_x));
  const [z, setZ] = useState(String(room.pos_z));
  const [w, setW] = useState(String(room.width));
  const [d, setD] = useState(String(room.depth));
  const [h, setH] = useState(String(room.height));
  const [err, setErr] = useState<string | null>(null);
  const applyGeometry = () => {
    const nums = [x, z, w, d, h].map(Number);
    if (!nums.every(Number.isFinite) || nums[2] <= 0 || nums[3] <= 0 || nums[4] <= 0) return setErr("Enter positive sizes.");
    const changed = nums[0] !== room.pos_x || nums[1] !== room.pos_z || nums[2] !== room.width || nums[3] !== room.depth || nums[4] !== room.height;
    if (!changed) return setErr(null);
    if (!onGeometry({ x: nums[0], z: nums[1], w: nums[2], d: nums[3] }, nums[4])) setErr("That would overlap another room.");
    else setErr(null);
  };
  return (
    <div className="card-base space-y-2 p-4">
      <h3 className="text-sm font-semibold">{isHallway(room) ? "Hallway" : "Room"}</h3>
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) onRename(e.target.value.trim());
        }}
        className="input-base text-sm"
        aria-label="Room name"
      />
      <p className="text-xs text-muted-foreground">
        {fmtM(room.width)} × {fmtM(room.depth)} · drag the corners to resize
      </p>
      <div className="space-y-1.5 border-t border-border pt-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connections</h4>
        {links.length > 0 && (
          <ul className="space-y-0.5 text-xs">
            {links.map((l) => (
              <li key={l.id}>
                {l.kind === "door" ? "Doorway" : "Archway"} → {l.title}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          {neighbours.map((n) => (
            <button key={n.id} type="button" onClick={() => onConnect(n.id)} className="btn-outline !px-2 !py-1 text-xs">
              + Connect to {n.title}
            </button>
          ))}
          <button type="button" onClick={onConnectOther} className="btn-ghost !px-2 !py-1 text-xs">
            Connect to another room…
          </button>
        </div>
      </div>
      <details className="group text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Advanced</summary>
        <div className="mt-2 grid grid-cols-2 gap-2" onBlur={applyGeometry} onKeyDown={(e) => e.key === "Enter" && applyGeometry()}>
          <NumField label="X (m)" value={x} onChange={setX} />
          <NumField label="Z (m)" value={z} onChange={setZ} />
          <NumField label="Width (m)" value={w} onChange={setW} min={0.5} />
          <NumField label="Depth (m)" value={d} onChange={setD} min={0.5} />
          <NumField label="Height (m)" value={h} onChange={setH} min={0.5} step={0.1} />
        </div>
      </details>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-1.5">
        {ROOM_COLORS.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => onTheme(t.value)}
            title={`Room colour: ${t.name}`}
            aria-label={`Room colour ${t.name}`}
            aria-pressed={(room.background ?? null) === t.value}
            className={`h-6 w-6 rounded-full border-2 ${(room.background ?? null) === t.value ? "border-primary ring-2 ring-ring/40" : "border-border"}`}
            style={{ background: t.value ?? "var(--card)" }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1 text-sm">
        {saved ? (
          <>
            <Link href={`/rooms/${room.id}`} className="btn-outline !px-3 !py-1.5">
              Loci &amp; cards
            </Link>
            <Link href={`/walk/${room.id}`} className="btn-ghost">
              Walk
            </Link>
            {onPreview && (
              <button onClick={onPreview} className="btn-ghost">
                3D preview
              </button>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Saving…</span>
        )}
        <button onClick={onDelete} className="btn-danger ml-auto">
          Delete
        </button>
      </div>
    </div>
  );
}

function OpeningPanel({
  opening,
  room,
  target,
  onKind,
  onWidth,
  onDelete,
}: {
  opening: Opening;
  room: Room | null;
  target: Room | null;
  onKind: (kind: OpeningKind) => void;
  onWidth: (widthM: number) => void;
  onDelete: () => void;
}) {
  const current = room ? openingWidthM(opening, room) : opening.width_m ?? 0.9;
  const [w, setW] = useState(String(Math.round(current * 100) / 100));
  const apply = () => {
    const n = Number(w);
    if (Number.isFinite(n) && n > 0 && Math.abs(n - current) > 1e-6) onWidth(n);
  };
  return (
    <div className="card-base space-y-2 p-4 text-sm">
      <h3 className="font-semibold">{opening.kind === "door" ? "Doorway" : "Archway"}</h3>
      <p className="text-xs text-muted-foreground">
        {room?.title ?? "Room"} · {opening.wall} wall
        {target ? ` → ${target.title}` : " (not linked)"}
      </p>
      <div className="flex gap-1.5">
        {(["archway", "door"] as const).map((k) => (
          <button key={k} onClick={() => onKind(k)} className={`rounded-md px-2.5 py-1 text-xs ${opening.kind === k ? "bg-primary text-primary-foreground" : "card-base"}`}>
            {k === "door" ? "Doorway" : "Archway (open)"}
          </button>
        ))}
      </div>
      <div onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()}>
        <NumField label="Width (m)" value={w} onChange={setW} step={0.1} min={0.3} />
      </div>
      <p className="text-xs text-muted-foreground">Arrow keys slide it along the wall.</p>
      <button onClick={onDelete} className="btn-danger">
        Delete {target ? "(both sides)" : ""}
      </button>
    </div>
  );
}

type ChooserInfo = { ra: Room; rb: Room; adjacent: boolean; hall: ReturnType<typeof planHallway>; linked: boolean };

/** Small popover: how should two rooms be connected? Archway (plain open gap) is the default. */
function ConnectChooser({
  info,
  style,
  onPick,
  onCancel,
}: {
  info: ChooserInfo;
  style: React.CSSProperties;
  onPick: (kind: ConnectKind) => void;
  onCancel: () => void;
}) {
  const options: Array<{ kind: ConnectKind; label: string; hint: string }> = info.adjacent
    ? [
        { kind: "archway", label: "Archway", hint: "Open gap, no door" },
        { kind: "door", label: "Doorway", hint: "Frame with a door" },
      ]
    : [
        { kind: "hallway", label: "Hallway", hint: `${fmtM(HALLWAY_WIDTH_M)} corridor, open ends` },
        { kind: "hallway-door", label: "Hallway + doorways", hint: "Corridor with a door at each end" },
      ];
  const blocked = !info.adjacent && !info.hall;
  return (
    <div
      role="dialog"
      aria-label={`Connect ${info.ra.title} and ${info.rb.title}`}
      className="absolute z-20 w-60 -translate-x-1/2 rounded-lg border border-border bg-card p-3 text-sm shadow-lg"
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-xs text-muted-foreground">
        Connect <b className="text-foreground">{info.ra.title}</b> ↔ <b className="text-foreground">{info.rb.title}</b>
        {info.linked ? " (already linked — adds another)" : ""}
      </p>
      {blocked ? (
        <p className="mb-2 text-xs text-destructive">No free straight or L-shaped path for a hallway. Move a room and try again.</p>
      ) : (
        <div className="space-y-1.5">
          {options.map((o, i) => (
            <button
              key={o.kind}
              type="button"
              autoFocus={i === 0}
              onClick={() => onPick(o.kind)}
              className={`flex w-full items-baseline justify-between rounded-md px-3 py-1.5 text-left ${i === 0 ? "bg-primary text-primary-foreground" : "card-base hover:border-primary/60"}`}
            >
              <span className="font-medium">{o.label}</span>
              <span className={`text-[11px] ${i === 0 ? "opacity-90" : "text-muted-foreground"}`}>{o.hint}</span>
            </button>
          ))}
          {!info.adjacent && info.hall && (
            <p className="text-[11px] text-muted-foreground">
              {info.hall.segments.length === 1 ? "Straight" : "L-shaped"} corridor, {fmtM(info.hall.length)} long.
            </p>
          )}
          {info.adjacent && <p className="text-[11px] text-muted-foreground">These rooms touch, so no hallway is needed.</p>}
        </div>
      )}
      <button type="button" onClick={onCancel} className="btn-ghost mt-2 !px-2 !py-1 text-xs">
        Cancel (Esc)
      </button>
    </div>
  );
}
