// Furniture: optional mnemonic anchors that make a room recognisable (your
// sofa, your grandmother's piano). Pure data + geometry, no React/three.
// Stored per room in rooms.metadata.furniture (jsonb), positions in
// room-local metres: x east, z north, item centred on (x, z).

export const FURNITURE_KINDS = [
  "sofa",
  "armchair",
  "table",
  "chair",
  "desk",
  "bed",
  "bookshelf",
  "cabinet",
  "piano",
  "fireplace",
  "tv",
  "lamp",
  "plant",
  "rug",
  "column",
  "statue",
  "fountain",
] as const;
export type FurnitureKind = (typeof FURNITURE_KINDS)[number];
export type Rotation = 0 | 90 | 180 | 270;

export interface FurnitureSpec {
  label: string;
  /** Footprint at rotation 0: w along x, d along z (metres). */
  w: number;
  d: number;
  h: number;
  /** Blocks walking (rugs don't). */
  solid: boolean;
  /** Default colour (the main material). */
  color: string;
}

export const FURNITURE: Record<FurnitureKind, FurnitureSpec> = {
  sofa: { label: "Sofa", w: 2.0, d: 0.9, h: 0.85, solid: true, color: "#8c4a3c" },
  armchair: { label: "Armchair", w: 0.9, d: 0.85, h: 0.9, solid: true, color: "#3f6e8c" },
  table: { label: "Table", w: 1.4, d: 0.8, h: 0.75, solid: true, color: "#9a6b3f" },
  chair: { label: "Chair", w: 0.5, d: 0.5, h: 0.9, solid: true, color: "#7a5230" },
  desk: { label: "Desk", w: 1.2, d: 0.6, h: 0.75, solid: true, color: "#6b4a2b" },
  bed: { label: "Bed", w: 1.6, d: 2.1, h: 0.6, solid: true, color: "#5b7fb5" },
  bookshelf: { label: "Bookshelf", w: 1.0, d: 0.35, h: 2.0, solid: true, color: "#7a5230" },
  cabinet: { label: "Wardrobe", w: 1.0, d: 0.6, h: 2.0, solid: true, color: "#a0784f" },
  piano: { label: "Piano", w: 1.5, d: 0.6, h: 1.2, solid: true, color: "#1d1d24" },
  fireplace: { label: "Fireplace", w: 1.4, d: 0.5, h: 1.2, solid: true, color: "#b9b1a3" },
  tv: { label: "TV", w: 1.2, d: 0.4, h: 1.2, solid: true, color: "#2b2b33" },
  lamp: { label: "Floor lamp", w: 0.4, d: 0.4, h: 1.6, solid: true, color: "#e8c46a" },
  plant: { label: "Plant", w: 0.5, d: 0.5, h: 1.2, solid: true, color: "#3f8f4a" },
  rug: { label: "Rug", w: 2.0, d: 1.4, h: 0.02, solid: false, color: "#b5523b" },
  column: { label: "Column", w: 0.6, d: 0.6, h: 3.0, solid: true, color: "#ece6d8" },
  statue: { label: "Statue", w: 0.6, d: 0.6, h: 2.0, solid: true, color: "#e4ded0" },
  fountain: { label: "Fountain", w: 1.4, d: 1.4, h: 0.9, solid: true, color: "#cfc6b4" },
};

export interface FurnitureItem {
  id: string;
  kind: FurnitureKind;
  x: number;
  z: number;
  rot: Rotation;
  /** Optional colour override (#rrggbb). */
  color?: string | null;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const MAX_FURNITURE = 80;
const HEX = /^#[0-9a-f]{6}$/i;

export function isFurnitureKind(k: unknown): k is FurnitureKind {
  return typeof k === "string" && (FURNITURE_KINDS as readonly string[]).includes(k);
}

/** Footprint after rotation (90/270 swap width and depth). */
export function footprint(item: Pick<FurnitureItem, "kind" | "rot">): { w: number; d: number } {
  const s = FURNITURE[item.kind];
  return item.rot === 90 || item.rot === 270 ? { w: s.d, d: s.w } : { w: s.w, d: s.d };
}

export function itemRect(item: Pick<FurnitureItem, "kind" | "rot" | "x" | "z">): Rect {
  const { w, d } = footprint(item);
  return { x0: item.x - w / 2, z0: item.z - d / 2, x1: item.x + w / 2, z1: item.z + d / 2 };
}

const round = (n: number, step = 0.05) => Math.round(n / step) * step;
const clean = (n: number) => Math.round(n * 1000) / 1000;

/** Keep an item's whole footprint inside the room (centred if it can't fit). */
export function clampToRoom<T extends Pick<FurnitureItem, "kind" | "rot" | "x" | "z">>(item: T, room: { width: number; depth: number }): T {
  const { w, d } = footprint(item);
  const cx = w >= room.width ? room.width / 2 : Math.min(room.width - w / 2, Math.max(w / 2, item.x));
  const cz = d >= room.depth ? room.depth / 2 : Math.min(room.depth - d / 2, Math.max(d / 2, item.z));
  return { ...item, x: clean(cx), z: clean(cz) };
}

/** Snap a dragged position to 5 cm and keep the item inside the room. */
export function placeAt<T extends Pick<FurnitureItem, "kind" | "rot" | "x" | "z">>(item: T, x: number, z: number, room: { width: number; depth: number }): T {
  return clampToRoom({ ...item, x: round(x), z: round(z) }, room);
}

export function nextRotation(rot: Rotation): Rotation {
  return (((rot + 90) % 360) as Rotation);
}

function toRotation(r: unknown): Rotation {
  const n = typeof r === "number" && Number.isFinite(r) ? ((Math.round(r / 90) * 90) % 360 + 360) % 360 : 0;
  return n as Rotation;
}

/**
 * Validate untrusted furniture (API input or stored jsonb): known kinds only,
 * finite positions clamped into the room, rotations snapped to 90°, unique
 * short ids, optional #rrggbb colour. Junk entries are dropped, never thrown.
 */
export function normalizeFurniture(raw: unknown, room: { width: number; depth: number }): FurnitureItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FurnitureItem[] = [];
  for (const r of raw) {
    if (out.length >= MAX_FURNITURE) break;
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    if (!isFurnitureKind(v.kind)) continue;
    if (typeof v.id !== "string" || !v.id || v.id.length > 40 || seen.has(v.id)) continue;
    if (typeof v.x !== "number" || !Number.isFinite(v.x) || typeof v.z !== "number" || !Number.isFinite(v.z)) continue;
    seen.add(v.id);
    const item: FurnitureItem = { id: v.id, kind: v.kind, x: v.x, z: v.z, rot: toRotation(v.rot) };
    if (typeof v.color === "string" && HEX.test(v.color)) item.color = v.color.toLowerCase();
    out.push(clampToRoom(item, room));
  }
  return out;
}

/** A room's furniture, read safely from its metadata. */
export function furnitureOf(room: { width: number; depth: number; metadata?: Record<string, unknown> | null }): FurnitureItem[] {
  return normalizeFurniture(room.metadata?.furniture, room);
}

/** Footprints that block walking (solid pieces only). */
export function obstacles(items: FurnitureItem[]): Rect[] {
  return items.filter((i) => FURNITURE[i.kind].solid).map(itemRect);
}

/** True when a circle (the walker) overlaps a rect. */
export function circleHitsRect(cx: number, cz: number, r: number, rect: Rect): boolean {
  const nx = Math.min(rect.x1, Math.max(rect.x0, cx));
  const nz = Math.min(rect.z1, Math.max(rect.z0, cz));
  return (cx - nx) ** 2 + (cz - nz) ** 2 < r * r;
}

/** A solid piece's footprint plus its height (for line-of-sight checks). */
export interface Blocker extends Rect {
  h: number;
}

/** Solid pieces as sight blockers; columns reach the ceiling. */
export function blockers(items: FurnitureItem[], roomHeight: number): Blocker[] {
  return items
    .filter((i) => FURNITURE[i.kind].solid)
    .map((i) => ({ ...itemRect(i), h: i.kind === "column" ? roomHeight : FURNITURE[i.kind].h }));
}

/**
 * Where segment a->b first enters rect r, as t in [0, 1], or null if it
 * misses (Liang–Barsky clipping on the plan).
 */
export function segmentEntersRect(ax: number, az: number, bx: number, bz: number, r: Rect): number | null {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, q] of [
    [-dx, ax - r.x0],
    [dx, r.x1 - ax],
    [-dz, az - r.z0],
    [dz, r.z1 - az],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t0;
}
