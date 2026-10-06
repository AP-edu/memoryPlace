# PC Handoff (Oct 2026) — see also SONNET-NOTES.md for the Phase H build log

Laptop pass is done and pushed. This doc is the plan waiting on the PC:
verify, launch on Vercel, then premium polish.

## What's on this branch (laptop-verified)

All green on the laptop: `npx tsc --noEmit` + `npm run lint` + `npm run test`
(97/97). No `next build` was run here — that verdict belongs to the PC.

- **Phase E home** — `/home` is the single Palace Overview (inline palace
  create/delete). `/palaces` list redirects to `/home`; `/dashboard`
  (My Courses) and `/courses`, `/decks` pages are deleted. Nav, login/signup
  redirects, and `proxy.ts` updated. Profile shows palace stats
  (palaces/cards/due/avg/streak + continue + needs-reinforcement).
  Landing + metadata copy scrubbed of courses/decks/flashcards.
- **Phase D spatial quiz** — walk tours have a Due-first / Walkthrough toggle
  sharing `sortPlayQueue` semantics with 2D study
  (`lib/scene3d.ts:orderTourStopsByCards`, tested in `lib/scene3d.test.ts`).
  New palace-scope tour at `/walk/palace/[palaceId]` (room-by-room in
  canonical order, due-first per room, linked doors stay in-tour).
- **Phase G laptop pass** — legacy UI + `/api/courses` + `Course` type
  deleted. Kept for the straight-quiz flow: `/quiz/[deckId]`,
  `/api/decks`, `/api/flashcards`, `/api/quiz-results`, Deck/Flashcard types.
  Admin page is now All Palaces (`GET /api/palaces?all=1`, admin-only;
  `DELETE` already admin-bypasses via `canModify`).
  Printable blueprint at `/palaces/[id]/print` (browser Print / Save-as-PDF
  + copyable plain-text blueprint for offline mental reconstruction).
  Home onboarding checklist (`localStorage mp.onboarded`, hides on completion
  or dismiss). Google provider live behind env, Apple stub button;
  OAuth link-or-create in `app/api/auth/[...nextauth]/route.ts`
  (OAuth rows get `password: ""` and `authorize()` rejects them — see guard).

## PC checklist (in order)

1. **Merge + pull**, `npm install` if needed. Note: `.next/` cache was
   deleted on the laptop (stale validator refs to deleted routes) — first
   build regenerates it.
2. **`npm run build`** — must be green before anything else.
3. **Real-GPU live check** (dev server, not Playwright software WebGL):
   - Room walk: Start tour, Due-first / Walkthrough toggle, MCQ grading,
     door walk-through.
   - Palace tour (`/walk/palace/[id]?tour=1`): room stepper, Prev/Next room,
     exit-door stays in-tour, palace rooms with no cards.
   - Print page: layout, Print dialog, copy-text button.
   - Onboarding: fresh user sees checklist, steps tick off, Dismiss persists.
   - Login page: Google button errors cleanly until env is set (expected);
     credentials login → `/home`.
4. **Supabase hosted project** — apply all 11 migrations in
   `supabase/migrations/` (newest: `deck_sessions_onboarding_step`).
   Verify tables: `card_reviews`, `cards.options`, `cards.position`,
   `decks.palace_id`/`decks.tags`, `cards.source_flashcard_id`,
   `flashcards.source_card_id`, `users.onboarded_at`,
   `users` email uniqueness (`users_email_lower_uniq`) + role check,
   `study_sessions.deck_id`, `users.onboarding_step`.
5. **Vercel** — import repo, set env, deploy:
   - `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (service-role bypass is the app model)
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL=https://<your>.vercel.app`
   - Deploy → smoke test: signup (first user → admin), create palace,
     place locus + card, study, walk, print.
6. **OAuth (after domain is known)** — Google Cloud console: register
   `https://<your>.vercel.app/api/auth/callback/google`, add
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to Vercel env, redeploy,
   test Google login (link-or-create by email; existing credential users
   keep their rows). Apple stays a stub until `APPLE_ID`/`APPLE_SECRET`
   are registered — then uncomment nothing; the provider auto-enables.

## Premium polish backlog (after launch)

Use premium models here; all laptop functionality is done.

- Per-room custom lighting themes (`CONCEPT.md` open question).
- Optional furniture as mnemonic anchors (geometry + markers — PC work).
- Locus audio cues (currently visual only).
- 3D feel pass: tour glide pacing, chevron density, `<Html>` label clutter,
  mobile joystick tuning, FPS on integrated GPUs.
- Full per-room mastery + weak-cards analytics (profile currently shows
  palace-level weakest link only).
- Guided-overlay version of onboarding (current: checklist card).
- `npm audit` vulnerabilities — deliberate upgrades only,
  never `npm audit fix --force` (see AGENTS.md).
