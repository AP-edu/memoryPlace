import { describe, expect, it } from "vitest";
import { demoPlan, walkRoute } from "./demoPalace";

describe("demo palace", () => {
  const plan = demoPlan();
  const route = walkRoute(plan);

  it("lays out three rooms with every locus inside its room", () => {
    expect(plan.rooms).toHaveLength(3);
    for (const l of plan.loci) {
      const r = plan.rooms.find((x) => x.id === l.roomId)!;
      expect(l.x).toBeGreaterThan(r.x);
      expect(l.x).toBeLessThan(r.x + r.w);
      expect(l.y).toBeGreaterThan(r.y);
      expect(l.y).toBeLessThan(r.y + r.h);
    }
  });

  it("walks every locus, room by room, through a door between rooms", () => {
    // 12 loci + one door point per room change (atrium -> garden -> library).
    expect(route).toHaveLength(plan.loci.length + 2);
    const first = plan.loci.find((l) => l.roomId === "atrium" && l.n === 1)!;
    expect(route[0]).toEqual({ x: first.x, y: first.y });
    const doorMids = plan.openings.map((o) => ({ x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 }));
    const throughDoors = route.filter((p) => doorMids.some((d) => d.x === p.x && d.y === p.y));
    expect(throughDoors).toHaveLength(2);
  });
});
