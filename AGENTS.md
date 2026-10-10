<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Product context

The product vision lives in `docs/product/` — `CONCEPT.md` is the source of
truth every plan is checked against, `WIREFRAMES.md` (+ `wireframes/` PDFs)
describes the intended UI. Free-tier model lineup is in `docs/MODELS.md`.

# Roadmap (locked)

Order of delivery from the vision docs; each phase ends green on tsc + eslint +
`next build` + a live check before moving on.

- 0. Wireframe capture — DONE.
- A. Data model v2 + 3D spike — rooms get width/depth/height, loci get
  wall/wall_offset/height, openings + card_reviews tables, throwaway R3F
  `/spike-3d/[roomId]` spike validating the geometry. DONE.
- B. Blueprint builder (2D): Palace Overview 2D Blueprint + Room Editor +
  Loci Placement Panel. No legacy dependencies. DONE.
- C. SRS + due engine (card_reviews), resurfacing into study/quiz. DONE.
- D. Spatial quiz (walk-and-answer at loci) replaces deck quiz. MCQ is hybrid:
  stored options when authored, else auto-derive distractors from sibling cards.
- E. Palace Overview becomes home; Summary/settings; PDF screens for
  Home/Courses/Profile/Stats absorbed in.
- F. 3D walk mode (first-person, doors/archways, loom-at-locus to reveal card).
  Shipped early as `/walk/[roomId]` (lib/walk.ts pure logic + R3F scene).
  DONE.
- G. Drop legacy courses UI + OAuth (Google real, Apple stub) + export/printable
  blueprint + onboarding. DONE.
- H. Unified study system: standalone decks (palace link + tags), live-linked
  card<->flashcard porting both ways (`/api/imports`, `/api/exports`,
  `/api/links`), deck quiz on the shared SRS engine, full session summary,
  server-side guided onboarding, Greek theme (blue sky + marble / starry
  night). DONE (PC live-click verdict green 2026-10-09).
- I. Launch UX: Palaces tab, profile edits, loci insertion UX, whole-level minimap
  (`lib/blueprint.ts` + `components/scene3d/MiniMap.tsx`), error/404/loading shell, metadata +
  manifest. DONE (PC canvas-click verdict green 2026-10-09).
- J. Experience pass: walk mode reads as a place (key/fill lighting, floor
  tiles, skirting + cornice, room-colour walls, wall-mounted numbered plaques,
  route on the floor, tour grades colour the plaques, click a plaque to walk
  there), seeded star field (`lib/sky.ts`), study shows the locus on the
  level map, palace hub header + per-room due/learned (`roomProgress`),
  blueprint thumbnails on palace cards (`groundPlan`), landing page with a
  walking demo palace (`lib/demoPalace.ts`), OAuth buttons only when
  configured. DONE (PC livecheck 34/34, 2026-10-09).
- K. Palace studio: the 3D tab rebuilds real places — rename/recolour/ceiling
  per room and furniture (17 low-poly pieces, `lib/furniture.ts`, stored in
  `rooms.metadata.furniture`, solid pieces block walking, footprints on every
  plan). DONE (livecheck 36/36, 2026-10-10).
- L. Redesign (user-approved, unlocks the Phase H "no third theme" call):
  three palettes x light/dark (Aegean, Library, Modern) on the same tokens,
  palette-driven 3D lighting, icon nav + phone tab bar, Practice hub
  (`/practice`: walk due loci first, 2D quick review as fallback), room
  colour as the screen accent (`lib/color.ts`, AA-checked), fly-in camera,
  doors that open, arrival chime + pulse, bloom/vignette/contact shadows with
  adaptive quality, furniture-aware tour viewpoints. DONE (livecheck 39/39,
  60 fps on RTX 5050 and the iGPU incl. phone, 2026-10-10).

## Geometry convention (Phase A, source of truth for B/F)

World y-up. Room spans x∈[0,width], z∈[0,depth], y∈[0,height]. Top-down floorplan:
x→right, **north (+z) drawn at the TOP** of every 2D view (screen y = −z; changed
in feat/grid-editor — the room editor previously drew z downward).
Walls: north (z=depth), south (z=0), east (x=width), west (x=0).
Levels (grid editor): a room sits on `level_id` with its min corner at
(`pos_x`, `pos_z`) in metres. Openings: `width_m` (metres) is authoritative,
legacy `width` is a fraction of the wall — always read via
`openingWidthM()` in `lib/geometry.ts`. Linked doors between adjacent rooms
are a pair of openings pointing at each other via `target_room_id`.
Deck world: `flashcards` (question/answer) live-link 1:1 to palace `cards` via
`cards.source_flashcard_id` <-> `flashcards.source_card_id` (always set/cleared
as a pair through `lib/links.ts`; FKs are ON DELETE SET NULL, never cascade).
A linked flashcard shares its card's single `card_reviews` row (SRS is per
card); unlinked flashcards are always-due with no SRS row (anchor nudge).
Loci anchor on `wall` + `wall_offset` (0..1 relative, resizes don't orphan) +
`height` (absolute units, default 1.5). `loci.position` is the single canonical
traversal-order authority.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # eslint
npm run test       # vitest run (no typecheck script — use npx tsc --noEmit)
npm run livecheck  # PC: real-GPU click-through of the build (scripts/livecheck.cjs)
```

A phase is green on `npx tsc --noEmit` + `npm run lint` + `npm run build` +
a live check (see Roadmap). `/check` runs the fast three; the live check is
`npm run build && npm run livecheck` (starts `next start` itself, seeds and
then deletes a throwaway `mp-livecheck-*` user in the `.env.local` Supabase,
artifacts in `.livecheck/`). Add checks there when a phase adds UI.

## Tech Stack

- Next.js 16 (App Router) + React 19 + R3F (`@react-three/fiber`,
  `@react-three/drei`, `three`)
- TypeScript throughout
- Tailwind CSS 4
- next-auth v4 + Supabase (`@supabase/supabase-js`)
- vitest for tests; Playwright (`npm run livecheck`) for the real-GPU verdict
- lucide-react icons; `@react-three/postprocessing` (bloom/vignette, WebGL2
  only, adaptive via drei `PerformanceMonitor`)
- Design system: every colour (UI + 3D scene + lights) is a token in
  `app/globals.css`, per palette (`data-palette` on <html>) and mode
  (`.dark`). `lib/themeContrast.test.ts` enforces WCAG AA for every
  palette/mode pair — add a palette there, never a one-off colour in a
  component. Room accents go through `lib/color.ts` (`accentFor`).
- 3D convention: pure logic in `lib/` (see `lib/walk.ts`), R3F scenes kept
  separate — never mix scene code into geometry/logic modules

## Machine split (laptop vs PC)

Two machines share this repo. Respect what each can do well.

- **Laptop:** 2D canvas work, API routes, quiz/SRS logic, text UI, pure `lib/`
  modules + vitest. Fast checks only: `npx tsc --noEmit` + `npm run lint` +
  `npm run test` (see `/check`).
- **PC (strong machine):** anything that adds geometry, markers, or `<Html>`
  labels to a scene; `npm run build`; FPS + live-click verification of 3D via
  `npm run livecheck` (discrete GPU) and `npm run livecheck -- --gpu=igpu`
  (the AMD integrated GPU, for the low-end FPS verdict); R3F dev-server
  iteration. `--gpu=software` runs on the laptop as a smoke test only:
  SwiftShader is slow and never a 3D verdict.
- Never run `npm audit fix --force` — it changes major versions and has broken
  the build before (eslint-config-next 16→14 broke flat-config lint; vitest
  3→5 gave unresolvable peers). Fix vulnerabilities with deliberate upgrades.

## End of session

Every session ends with the PC swap: run `/handoff` (push, state summary,
what's verified vs what needs the PC). Laptops sessions never close out 3D
work as green — that verdict belongs to the PC after build + live check.
