---
description: Review changes against vision docs and geometry convention
agent: plan
subtask: true
---
Review the uncommitted changes. Start with `git status --short` and `git diff --stat`, then read the changed files yourself (do not paste full diffs into the report).

1. Check against `docs/product/CONCEPT.md` — does this match the source of truth every plan is checked against?
2. Check the Geometry convention (AGENTS.md Phase A): north (+z) at TOP of every 2D view, loci anchored on wall + wall_offset + height, widths always via `openingWidthM()`, `loci.position` as traversal authority.
3. Check for legacy dependencies in new blueprint work (roadmap phase B forbids them) and for R3F scene / pure-logic separation (the `lib/walk.ts` pattern).
4. Flag scope creep against the locked roadmap phases.

Report findings as a list. Do not edit code — this runs as a plan subagent.
