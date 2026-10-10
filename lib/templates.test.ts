import { describe, expect, it } from "vitest";
import { TEMPLATES, placeDoors, templateById, templatePlan, templateStats, templateWorld, type PalaceTemplate } from "./templates";
import { FURNITURE, MAX_FURNITURE, footprint, itemRect, normalizeFurniture, segmentEntersRect, type FurnitureItem, type Rect } from "./furniture";
import { openingWidthM, wallPoint } from "./geometry";
import { anchorInOpening, inwardNormal } from "./scene3d";
import type { Opening, Room } from "@/types/database";

const rectsOverlap = (a: Rect, b: Rect) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
const roomRect = (r: Pick<Room, "pos_x" | "pos_z" | "width" | "depth">): Rect => ({ x0: r.pos_x, z0: r.pos_z, x1: r.pos_x + r.width, z1: r.pos_z + r.depth });

describe.each(TEMPLATES.map((t) => [t.name, t] as [string, PalaceTemplate]))("%s", (_name, t) => {
  const world = templateWorld(t);
  const furnitureOf = (room: Room) => normalizeFurniture(room.metadata.furniture, room);

  it("has unique room keys and titles", () => {
    expect(new Set(t.rooms.map((r) => r.key)).size).toBe(t.rooms.length);
    expect(new Set(t.rooms.map((r) => r.title)).size).toBe(t.rooms.length);
  });

  it("has no overlapping rooms", () => {
    for (const [i, a] of world.rooms.entries())
      for (const b of world.rooms.slice(i + 1)) expect(rectsOverlap(roomRect(a), roomRect(b)), `${a.title} / ${b.title}`).toBe(false);
  });

  it("puts every door on a shared wall, both halves at the same spot", () => {
    const doors = placeDoors(t);
    expect(doors.length).toBe(t.doors.length);
    for (const o of world.openings) {
      const room = world.rooms.find((r) => r.id === o.room_id)!;
      const twin = world.openings.find((x) => x.room_id === o.target_room_id && x.target_room_id === o.room_id)!;
      expect(twin, `${room.title} door has a return twin`).toBeTruthy();
      const other = world.rooms.find((r) => r.id === twin.room_id)!;
      const p = wallPoint(o.wall, o.wall_offset, room);
      const q = wallPoint(twin.wall, twin.wall_offset, other);
      expect(p.x + room.pos_x).toBeCloseTo(q.x + other.pos_x, 4);
      expect(p.z + room.pos_z).toBeCloseTo(q.z + other.pos_z, 4);
    }
  });

  it("can reach every room from the first through doors", () => {
    const seen = new Set([world.rooms[0].id]);
    const queue = [world.rooms[0].id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const o of world.openings.filter((x) => x.room_id === id && x.target_room_id)) {
        if (!seen.has(o.target_room_id!)) {
          seen.add(o.target_room_id!);
          queue.push(o.target_room_id!);
        }
      }
    }
    expect([...seen].length).toBe(world.rooms.length);
  });

  it("keeps furniture inside its room, apart, and out of doorways", () => {
    for (const [i, room] of world.rooms.entries()) {
      const raw = t.rooms[i].furniture ?? [];
      const items = furnitureOf(room);
      expect(items.length, `${room.title}: every piece survives validation`).toBe(raw.length);
      expect(items.length).toBeLessThanOrEqual(MAX_FURNITURE);
      raw.forEach((f, j) => {
        expect(items[j].x, `${room.title} ${f.kind} #${j} x inside`).toBeCloseTo(f.x, 3);
        expect(items[j].z, `${room.title} ${f.kind} #${j} z inside`).toBeCloseTo(f.z, 3);
      });
      const solid = items.filter((it) => FURNITURE[it.kind].solid);
      for (const [a, x] of solid.entries())
        for (const y of solid.slice(a + 1)) expect(rectsOverlap(itemRect(x), itemRect(y)), `${room.title}: ${x.kind}@${x.x},${x.z} vs ${y.kind}@${y.x},${y.z}`).toBe(false);
      // A walker-wide clear zone in front of every opening.
      for (const o of world.openings.filter((x) => x.room_id === room.id)) {
        const w = openingWidthM(o, room);
        const c = wallPoint(o.wall, o.wall_offset, room);
        const n = inwardNormal(o.wall);
        const along = o.wall === "north" || o.wall === "south" ? { x: 1, z: 0 } : { x: 0, z: 1 };
        const ends = [-w / 2 + 0.05, w / 2 - 0.05].map((s) => ({ x: c.x + along.x * s, z: c.z + along.z * s }));
        const zone: Rect = {
          x0: Math.min(...ends.map((e) => e.x), ...ends.map((e) => e.x + n.x * 0.9)),
          x1: Math.max(...ends.map((e) => e.x), ...ends.map((e) => e.x + n.x * 0.9)),
          z0: Math.min(...ends.map((e) => e.z), ...ends.map((e) => e.z + n.z * 0.9)),
          z1: Math.max(...ends.map((e) => e.z), ...ends.map((e) => e.z + n.z * 0.9)),
        };
        for (const it of solid) expect(rectsOverlap(zone, itemRect(it)), `${room.title}: ${it.kind}@${it.x},${it.z} blocks the ${o.wall} doorway`).toBe(false);
      }
    }
  });

  it("hangs loci clear of doorways, apart, below the ceiling and in view", () => {
    for (const room of world.rooms) {
      const loci = world.loci.filter((l) => l.room_id === room.id);
      const openings = world.openings.filter((o): o is Opening => o.room_id === room.id);
      const items: FurnitureItem[] = furnitureOf(room);
      for (const l of loci) {
        expect(anchorInOpening({ wall: l.wall!, wall_offset: l.wall_offset! }, room, openings), `${room.title}: "${l.label}" in a doorway`).toBe(false);
        expect(l.height!).toBeLessThan(room.height - 0.2);
        // Nothing tall standing right in front of the plaque.
        const p = wallPoint(l.wall!, l.wall_offset!, room);
        const n = inwardNormal(l.wall!);
        for (const it of items.filter((x) => FURNITURE[x.kind].solid && (x.kind === "column" ? room.height : FURNITURE[x.kind].h) > l.height! - 0.25)) {
          const hit = segmentEntersRect(p.x + n.x * 0.1, p.z + n.z * 0.1, p.x + n.x * 1.2, p.z + n.z * 1.2, itemRect(it));
          expect(hit, `${room.title}: "${l.label}" hidden behind ${it.kind}@${it.x},${it.z}`).toBeNull();
        }
      }
      for (const [i, a] of loci.entries())
        for (const b of loci.slice(i + 1)) {
          if (a.wall !== b.wall) continue;
          const pa = wallPoint(a.wall!, a.wall_offset!, room);
          const pb = wallPoint(b.wall!, b.wall_offset!, room);
          expect(Math.hypot(pa.x - pb.x, pa.z - pb.z), `${room.title}: "${a.label}" / "${b.label}"`).toBeGreaterThan(0.6);
        }
    }
  });

  it("draws a plan and counts", () => {
    const plan = templatePlan(t)!;
    expect(plan.rooms.length).toBe(t.rooms.length);
    expect(plan.openings.length).toBe(t.doors.length * 2);
    const stats = templateStats(t);
    expect(stats.loci).toBe(world.loci.length);
    expect(stats.loci).toBeGreaterThanOrEqual(8);
  });
});

describe("templates", () => {
  it("are looked up by id", () => {
    expect(templateById("parthenon")?.name).toBe("The Parthenon");
    expect(templateById("nope")).toBeNull();
  });

  it("use ids that never pass for unsaved editor rooms", () => {
    for (const t of TEMPLATES) for (const r of templateWorld(t).rooms) expect(r.id.startsWith("tmp-")).toBe(false);
  });

  it("only use known furniture with sane footprints", () => {
    for (const t of TEMPLATES)
      for (const r of t.rooms)
        for (const f of r.furniture ?? []) {
          expect(FURNITURE[f.kind]).toBeTruthy();
          const fp = footprint({ kind: f.kind, rot: f.rot ?? 0 });
          expect(fp.w).toBeLessThanOrEqual(r.w);
          expect(fp.d).toBeLessThanOrEqual(r.d);
        }
  });
});
