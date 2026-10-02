---
name: mp-3d-scene
description: Use when writing or modifying any R3F/3D scene in mp, or any module under lib/ that scene code imports. Enforces the pure-logic / scene separation and the Phase A geometry convention.
---

# mp 3D scene convention

All 3D work in mp follows one split: **pure logic in `lib/`, rendering in R3F scenes**. Reference implementation: `lib/walk.ts` (pure walk logic) + the `/walk/[roomId]` R3F scene.

## Rules

- Geometry and traversal logic live in `lib/` as framework-free TypeScript. They must be importable and unit-testable with no React, no three.js, no canvas.
- R3F scene components consume `lib/` modules; they never re-implement geometry math inline.
- All spatial math follows the Phase A convention in AGENTS.md: world y-up, room x∈[0,width] / z∈[0,depth] / y∈[0,height], north (+z) at TOP of 2D views, loci on wall + wall_offset + height, opening widths via `openingWidthM()` in `lib/geometry.ts`, `loci.position` as traversal authority.
- New scenes (e.g. future walk-mode extensions) copy the `lib/walk.ts` + scene pair structure; do not start scene code from an empty file without a backing lib module.
