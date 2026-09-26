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
  Loci Placement Panel. No legacy dependencies.
- C. SRS + due engine (card_reviews), resurfacing into study/quiz.
- D. Spatial quiz (walk-and-answer at loci) replaces deck quiz. MCQ is hybrid:
  stored options when authored, else auto-derive distractors from sibling cards.
- E. Palace Overview becomes home; Summary/settings; PDF screens for
  Home/Courses/Profile/Stats absorbed in.
- F. 3D walk mode (first-person, doors/archways, loom-at-locus to reveal card).
- G. Drop legacy courses/decks/flashcards tags + OAuth (Google real, Apple stub)
  + export/printable blueprint + onboarding (guided tour folded in here).

## Geometry convention (Phase A, source of truth for B/F)

World y-up. Room spans x∈[0,width], z∈[0,depth], y∈[0,height]. Top-down floorplan:
x→right, z→down. Walls: north (z=depth), south (z=0), east (x=width), west (x=0).
Loci anchor on `wall` + `wall_offset` (0..1 relative, resizes don't orphan) +
`height` (absolute units, default 1.5). `loci.position` is the single canonical
traversal-order authority.
