# SONNET-NOTES — Phase H build log

What was built, what was verified, and what is blocked or deferred. Written so
the PC pass (real GPU + live clicking) knows exactly where to look.

## Verified (automated, on this machine)

- `npx tsc --noEmit`, `npm run lint`, `npm run test` (all green), `npm run build` (green, 34 routes).
- Two live API smoke suites against the dev server + hosted Supabase (throwaway
  users, cleaned up after): deck CRUD/tags/filters, import/export/link/unlink/push,
  409 on duplicate links, card move, unified SRS (a deck grade moves the palace
  card's `card_reviews` row), deck sessions, reschedule, onboarding state,
  summary payloads. All pass.
- Hosted DB: 11/11 migrations applied. Confirmed by provoking them:
  `users_email_lower_uniq` (23505 on a case-variant duplicate) and
  `users_role_check` (23514).
- Screenshots (software WebGL) of light + dark: landing, home, decks, deck
  detail, room editor, walk view, print, results, onboarding overlay.

## PC verification pass (2026-10-09, RTX 5050)

`tsc` + `lint` + 144 tests + `next build` green. Live checks ran against
`next start` + hosted Supabase in Chromium on the real GPU (ANGLE/Vulkan,
not SwiftShader), with throwaway users deleted afterwards: 29/29 green.

Verified by clicking: wall placement (hover readout, Undo, Ctrl+Z), doorway
refusal, `P`/`V`/`Esc`, marker drag (height kept) + Shift-drag (height),
Spread evenly, header Import deck leaves place mode, editor minimap room tap,
Palace 3D tab (select room, `+ Add loci` -> place mode), walk minimap
wedge/locus glide/door tap, door prompt walk-through, tour Due-first/
Walkthrough + MCQ + Full summary, palace tour room stepper, phone width
(390 px, touch), print page, 404 shell, onboarding overlay, profile
rename/email/password + re-login, per-locus Import from deck / Send to deck,
Push to deck, Unlink (both sides cleared), night-sky stars. Walk + palace
tour hold 60 fps (rAF-capped).

Bugs found and fixed:

1. Marker drag worked once per page load: `raycast={… : undefined}` never
   restored picking (R3F ignores `undefined` props). Now restores
   `THREE.Mesh.prototype.raycast` (`RoomShell.tsx`).
2. Deck import ("one new locus each") could drop a locus inside a doorway.
   `planLocusAnchors` now spreads over the wall's solid length with the
   editor's 0.15 m clearance (`solidOffset` in `lib/walk.ts`, shared with
   `distributeOnWall`).
3. Minimap: a locus beside a door swallowed the door tap. Taps now resolve to
   the nearest target (`pickMapTarget` in `lib/blueprint.ts`).
4. Phone walk: the joystick covered the tour card (MCQ choice 1) and the
   locus card; the minimap stayed hidden after "Keep walking". Joystick and
   minimap now follow one `cardOpen` flag; an unmounted joystick zeroes input.
5. 3D `<Html>` labels painted over HUD buttons and editor forms. `SceneGate`
   now wraps every canvas in an `isolate` layer.
6. Palace 3D overview: room floors weren't pickable, so selecting a room
   meant hitting a thin far wall. Floors are pickable there now; orbit-drag
   releases don't select.
7. Editor "Moved … · Undo" snackbar blocked grabbing the marker behind it;
   only the Undo button takes clicks now.
8. Review minors: PG messages no longer leak in 500s (`lib/apiError.ts`,
   logged server-side); lookups use `maybeSingle()` + error check, so DB
   errors are 500 not 404 and malformed uuids (22P02) are 404 not 500;
   flashcard Q/A must be strings (no `String()` coercion); `MAX_STEP` is
   `ONBOARDING_STEPS.length` (4).

Still unverified: the browser Print dialog's paper layout, a real phone
(touch was emulated), and FPS on an integrated GPU. Night stars render but
are sparse overhead: drei `<Stars>` point size ignores DPR, so tune `factor`
in `SceneSky.tsx` by eye if wanted.

## NOT verified — needs the PC (real GPU + live clicking) — superseded by the pass above

- Walk tour interactions end to end: MCQ grading, the new `1 = Missed / 2 = Got it`
  key order, door walk-through, the door-prompt hysteresis (2.0 m in / 2.6 m out),
  and the "Full summary" button after a tour (it depends on the session POST
  finishing; it appears a moment after the local summary).
- Palace tour (`/walk/palace/[id]`): each room's tour saves its own session; the
  "Full summary" link returns to that room.
- Stars: the night sky uses drei `<Stars>` plus a gradient dome. In software-GL
  walk screenshots the camera mostly sees walls and floor, so the stars were not
  visible there. Confirm on a real GPU and, if needed, tune `count`/`factor` in
  `components/scene3d/SceneSky.tsx`.
- Room editor "Import from deck" / "Send to deck" panels and the per-card
  linked badge, push and unlink controls were only checked through the API and
  by rendering, not clicked.
- Print dialog output (the SVG blueprint renders on screen; paper layout not checked).
- FPS: the sky dome adds one sphere and (night only) 1,800 star points per canvas.

## Review fix pass (post-Sonnet, pre-ship)

A read-only review found 5 API ship-blockers; all fixed and re-verified
(`tsc` + `lint` + 126 tests green, both live smoke suites green, plus a
targeted suite: bogus export ids → 404, bad session scores → 400):

1. `app/api/exports/route.ts` — source fetches now fail closed (every fetch
   checks `error`; unknown card/locus/room ids → 404; rooms mismatch → 404).
2. `app/api/links/route.ts` DELETE — twin resolved first, then BOTH sides
   authorized; a caller can no longer clear a link touching a foreign row.
3. `app/api/links/route.ts` PUT — push requires both FK directions to agree,
   so half-linked rows can never mistarget content.
4. `app/api/imports/route.ts` + `exports/route.ts` — second-half link mapping
   now joins on the link column just written (select-by-`source_*_id`), never
   by insert/timestamp order; 409 surfaces when a row was linked meanwhile.
5. `app/api/study-sessions/route.ts` — scores must be integers with
   `0 <= score <= total`, `total > 0`, `answers.length <= total`; ownership via
   `canModify` (admin bypass consistent with every other route).
6. Drive-by: `app/api/cards/[id]/route.ts` dead `front` variable removed.

Remaining minor items from that review: all four fixed in the PC
verification pass below.

- **New migration** `20261007000003_deck_sessions_onboarding_step.sql`:
  `study_sessions.deck_id` (FK, SET NULL, indexed) and `users.onboarding_step`.
- **Deck quiz = palace study.** `/quiz/[deckId]` now renders `StudySession` on
  `GET /api/reviews?deck=`. Same keyboard, mode toggle and summary flow.
- **Greece theme replaces the old palette, no third switch.** Light = sky/marble/
  Aegean blue, dark = starry night. The light/dark/system toggle is unchanged.
  Headings use Cormorant Garamond (`font-display` uses lining figures).
- **Room colour swatches** were renamed/recoloured (Aegean, Sea, Gold, Terracotta,
  Amethyst, Olive). Rooms that already stored an old hex still render it.
- **Onboarding state moved server-side.** `localStorage mp.onboarded` is migrated
  once to `users.onboarded_at`, then removed. Replay lives on `/profile`.
- Deck reads are owner/admin only (`GET /api/decks/[id]`, `GET /api/flashcards?deck=`).
  The old "any logged-in user can read any deck's cards" behaviour is gone.
- Streaks use the learner's local day (client passes `?tz=`); `streakDays(…, tz)`
  defaults to UTC for callers that don't.
- Removed the `/spike-3d` redirect shim and its matcher entry (superseded in Phase A).
- Archived `ARCHITECTURE-and-LESSONS.md`, `QUIZ_TESTING.md`, `DEMO-SCRIPT.md` to
  `docs/archive/` with a STALE banner.

## Blocked / deferred (and why)

1. **SRS is per card globally, not per user.** `card_reviews` has `card_id` as its
   only primary key (a hard rule: don't change it). Two users who could both grade
   one card would overwrite each other. Today only the owner can grade a palace
   card, so it is latent. Needs: a composite `(card_id, user_id)` key before any
   shared/instructor palaces ship.
2. **Unlinked flashcards have no scheduling.** By design they are always-due and
   `POST /api/reviews {flashcard_id}` returns `{ scheduled: false }`. The nudge UI
   ("port to a palace") covers it. A separate `flashcard_reviews` table would let
   them schedule without anchoring; not built because it splits the SRS loop again.
3. **`/api/quiz-results` and its page are now unused** (`quiz_results` rows are
   historical). Left in place; safe to delete in a cleanup pass.
4. **No cloze/image/audio rendering in study.** Card `type` and `media_refs` exist
   in the DB and API, but the editors still only author basic text cards and study
   renders text. Needs: a card-type selector and renderers in `Room3DEditor`,
   `StudySession` and `WalkView`.
5. **Loci plaque-vs-icon style, per-room lighting, furniture, audio cues**: not
   started (outside this phase's goal; still open in `CONCEPT.md`).
6. **Label clutter / glide pacing / joystick** (the 3D feel pass): not touched.
   Only the door-prompt hysteresis and the focus-card reveal reset were fixed.
7. **Email delivery for password reset** is still a TODO (`forgot-password/route.ts`);
   production must keep `ALLOW_PASSWORD_RESET_DISCLOSURE=false`.
8. **Dependabot** reports 1 high + 2 moderate vulnerabilities. Untouched on purpose
   (deliberate upgrades only, never `npm audit fix --force`).
9. **Existing hosted deck rows** whose legacy `course_id` has no matching palace stay
   standalone (`palace_id` null) after the backfill; nothing was dropped.
