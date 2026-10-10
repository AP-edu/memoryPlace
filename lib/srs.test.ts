import { describe, expect, it } from "vitest";
import { isDue, roomProgress } from "./srs";

const now = 1_000_000;
const item = (roomId: string, dueAt: number | null, reviewed: boolean) => ({
  id: `${roomId}-${dueAt}-${reviewed}`,
  roomId,
  roomOrder: 0,
  position: 0,
  dueAt,
  review: reviewed ? {} : null,
});

describe("isDue", () => {
  it("treats new cards as due and future ones as not", () => {
    expect(isDue(item("a", null, false), now)).toBe(true);
    expect(isDue(item("a", now - 1, true), now)).toBe(true);
    expect(isDue(item("a", now + 1, true), now)).toBe(false);
  });
});

describe("roomProgress", () => {
  it("counts total, due and learned per room", () => {
    const p = roomProgress(
      [item("a", null, false), item("a", now - 5, true), item("a", now + 5, true), item("b", now + 9, true)],
      now
    );
    expect(p.get("a")).toEqual({ total: 3, due: 2, learned: 1 });
    expect(p.get("b")).toEqual({ total: 1, due: 0, learned: 1 });
    expect(p.get("c")).toBeUndefined();
  });
});
