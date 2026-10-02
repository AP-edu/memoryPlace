---
description: Run vitest suite and focus on failures
agent: build
---
Run `npm run test` (vitest run). If tests fail: show only the failures with file:line, explain the most likely cause for each, and suggest fixes. Do not edit code unless asked. Flag any failures touching `lib/geometry.ts`, `lib/walk.ts`, or R3F scenes — geometry regressions break the Phase A convention in AGENTS.md.
