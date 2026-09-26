# Model lineup (Sept 2026, free tier)

- **Plan** on `opencode/muse-spark-1.3-contributor-free`
  (strongest free reasoning, Intelligence Index ~61 class).
- **Build** on `opencode/big-pickle`
  (best free coding precision in our probe — `route.ts:13`-level references;
  can be inconsistent run to run).
- **Fallbacks:** `opencode/nemotron-3.5-lightning-free` for fast iterations,
  `opencode/mimo-v2.5-free` when vision is needed (screenshots/UI).
- **Avoid** `opencode/union-alpha` (anonymous maker).
- `opencode/deepseek-v4-flash-free` does **not** resolve on this backend
  (`ProviderModelNotFoundError`) — do not pin it.

Re-test monthly; free models rotate.
