---
description: Fast green gate — tsc, eslint, vitest
agent: build
---
Run the fast correctness gate. Stop at the first red step and report it; do not proceed to slower steps or fix anything unless asked.

1. `npx tsc --noEmit` (there is no typecheck script in package.json)
2. `npm run lint`
3. `npm run test` (vitest run)

Per the locked roadmap, a phase is only green with tsc + eslint + `next build` + a live check. This command covers the fast three; run `npm run build` separately once those pass and say so explicitly.
