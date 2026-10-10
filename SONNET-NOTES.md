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

## PC verification pass (2026-10-09)

Rerun any time with `npm run build && npm run livecheck` (`scripts/livecheck.cjs`,
29 checks; it starts `next start`, seeds + deletes a throwaway user in the
hosted Supabase, writes screenshots + the print PDF to `.livecheck/`).

Green: `tsc` + `lint` + 151 tests + `next build`, and 29/29 live checks on
both GPUs of the PC: RTX 5050 (`npm run livecheck`) and the AMD Radeon
integrated GPU (`-- --gpu=igpu`). Walk holds a steady 60 fps on both at
1440x900 and at phone size (390x844 @2x render): p95 16.7 ms, 0% of frames
over 25 ms (headless caps at 60; SwiftShader gets 28 fps, so the metric bites).

Covered by clicking: wall placement (hover readout, Undo, Ctrl+Z), doorway
refusal, `P`/`V`/`Esc`, marker drag (height kept) + Shift-drag + a second drag
of the same marker, Spread evenly, header Import deck, editor minimap room
tap, Palace 3D tab (floor click selects, `+ Add loci` -> place mode), walk
minimap wedge/locus glide/door tap, door prompt walk-through, tour Due-first/
Walkthrough + MCQ + Full summary, palace tour stepper, phone layout (card vs
joystick vs minimap, HUD above labels, joystick held through a card opening),
night sky (stars overhead, at the horizon, in the palace overview), print
(chrome hidden in print media, A4 PDF rendered), 404 shell, onboarding
overlay, profile rename/email/password + re-login, per-locus Import from deck /
Send to deck / Push / Unlink, API hardening (bogus ids, non-string Q/A).

Bugs found and fixed:

1. Marker drag worked once per page load: `raycast={… : undefined}` never
   restored picking (R3F ignores `undefined` props). Now restores
   `THREE.Mesh.prototype.raycast` (`RoomShell.tsx`).
2. Deck import could drop a locus inside a doorway. `planLocusAnchors` now
   plans along each wall's solid length, keeps 0.5 m from door jambs, and
   skips walls that are all opening (`solidOffset` in `lib/walk.ts`, shared
   with `distributeOnWall`).
3. Minimap: a locus beside a door swallowed the door tap. Taps now resolve to
   the nearest target (`pickMapTarget` in `lib/blueprint.ts`).
4. Phone walk: the joystick covered the tour card (MCQ choice 1) and the
   locus card; the minimap stayed hidden after "Keep walking". One `cardOpen`
   flag drives both; the joystick hides on release, so a card opening
   mid-push doesn't yank it from under the thumb.
5. 3D `<Html>` labels painted over HUD buttons and editor forms. `SceneGate`
   wraps every canvas in an `isolate` layer.
6. Palace 3D overview: floors weren't pickable, so selecting a room meant
   hitting a thin far wall. Floors pick there now; orbit-drag releases don't.
7. Editor "Moved … · Undo" snackbar blocked grabbing the marker behind it;
   only the Undo button takes clicks now.
8. Night sky was near-empty overhead in walk mode and invisible in the
   editor/palace domes: drei `<Stars>` sized points by distance in raw
   framebuffer pixels. Replaced with a seeded field (`lib/sky.ts`) drawn at a
   fixed CSS-pixel size x DPR (`SceneSky.tsx`). Zenith band: 4 -> 32 stars.
9. Blueprint/minimap: loci on a wall two rooms share sat on the line, so it
   was unclear whose they were. Plan loci are inset 0.45 m into their room
   (`LOCUS_INSET_M`).
10. Review minors: PG messages no longer leak in 500s (`lib/apiError.ts`,
    logged server-side); lookups use `maybeSingle()` + error check, so DB
    errors are 500 not 404 and malformed uuids (22P02) are 404 not 500;
    flashcard Q/A must be strings; `MAX_STEP` is `ONBOARDING_STEPS.length` (4).

Still unverified: a real phone (touch is emulated via CDP) and the browser's
own Print dialog (the PDF comes from the same print-media rendering).

## One building + famous places (2026-10-10, Phase M)

User asks: "full 3D render of what the blueprint looks like... recreate
favourite sites to walk through", a markdown input field for deck answers, and
"walkthrough in practice mode doesn't do anything".

- **Practice walk bug (root causes):** the walk HUD's "Due first / Walkthrough"
  was a mode toggle that started nothing (clicking Walkthrough looked dead), and
  the palace tour always started in the first-created room (often an empty
  entrance: no stops, no tour) and stopped after one room. Now each order
  button starts a tour; the tour starts at `tourStartRoom` (first room with due
  cards) and the summary offers "Continue to <next room>" (`nextTourRoom`),
  which glides through the connecting door (or flies down from above).
- **One building:** `WalkView` takes `world` (the palace) and draws every room
  on the level in the current room's frame; open doors show the real next room
  instead of sky. Walking through carries the pose (`carryPose`) and the parent
  swaps the room in place — no remount, no reload (live check asserts
  `window.__sameDoc`). Both walk routes are `components/walk/PalaceWalk.tsx`,
  which fetches the palace once (`/api/reviews?palace=` supplies cards + due).
- **Overview** (button or O): the camera rises over the whole floor, north up,
  long lens; room labels fly you down into any room. The fly-in is the same
  blend run backwards, so it now descends from over the whole building.
- **Famous places:** the Parthenon, House of the Vettii, Tutankhamun's tomb,
  221B Baker Street, Trinity's Long Room, a family home. `/explore` (public,
  static) walks them signed out; "Build it" creates the palace with rooms,
  furniture, door pairs and suggested loci in one request (rolled back on
  failure). Landing + Palaces tab link to them.
- **Trace a plan:** upload a photo/scan of any floor plan under the 2D grid,
  click two points + enter the real distance to set its scale, move it, fade
  it; rooms turn see-through while tracing. Stored per level in IndexedDB
  (never uploaded).
- **Markdown editor:** toolbar (bold, italic, strike, heading, lists,
  checklist, quote, code, code block, link), shortcuts (Ctrl/Cmd+B/I/K/E,
  Ctrl+Shift+X, Ctrl+Enter submits), list continuation on Enter, undo keeps
  working (`execCommand("insertText")`), live preview. Used for deck cards and
  palace cards; rendering gained GFM (`remark-gfm` 4.0.1, pinned) and is now
  used in palace-scope study too.
- **Fixes on the way:** `SceneGate` probed WebGL during SSR (hydration mismatch
  on pre-rendered 3D pages) — now probes once in the browser; stale floor
  arrows from the previous room crashed `NavChevrons` for one frame.
- Verified: tsc, lint, 273 tests, `next build`, livecheck 45/45 on the RTX 5050
  and 45/45 on the iGPU (60 fps desktop, phone and the 8-room villa).
- Not verified: a real phone; a big hand-built palace (10+ rooms) on the iGPU.

## Palace studio + redesign (2026-10-10, Phases K and L)

The user unlocked the design decisions (palette, fonts, navigation, page
structure, libraries) and approved the redesign plan; brief chosen in their
absence: calm / scholarly / cinematic / a little playful, for students and
self-learners, desktop-first with solid phone support.

- Studio (K): select a room in 3D (camera glides to it) -> rename, recolour,
  ceiling height, furnish (place, drag, R rotate, Del remove, recolour).
  Size/position stay on the 2D blueprint (it reconciles overlaps and linked
  doors). Furniture validated server-side against the final room size.
- Bug fixed: the 2D grid editor remounted from the first fetch after a tab
  switch and dropped edits made in the session.
- Palettes (L): Aegean (default), Library (parchment/ink/brass; candlelit at
  night), Modern (neutral/indigo). Picker in the nav's Appearance menu and on
  Profile; pre-paint script applies it with no flash. Lights are tokens too
  (`--scene-key/-fill/-hemi/-boost`).
- Navigation: Home / Practice / Palaces / Decks with icons, account menu,
  phone tab bar (hidden in walk mode). Profile leads with progress.
- Practice (`/practice`) and Home "Continue" lead with walking the due loci;
  2D quick review is the secondary action.
- Rooms colour their screens (editor, walk, palace tour, and per-card in
  study) via `useRoomAccent` -> `accentFor` (AA for all swatches x palettes).
- Walk motion: fly-in from the plan view (skipped for reduced motion / door
  arrivals), door leaves swing open within 2.6 m, arrival pulse + pentatonic
  chime (mute toggle, `mp-sound`). Bloom + vignette + baked contact shadows.
  Adaptive quality: touch devices cap DPR 1.5, no MSAA; PerformanceMonitor
  steps down further. iGPU phone viewport went 46 -> 60 fps with this.
- Tour viewpoints avoid furniture (height-aware line of sight).

## Experience pass (2026-10-09, Phase J)

Goal: make the core loop feel like the product in CONCEPT.md, judged by
walking through every screen (desktop/phone, light/dark) with a realistic
seeded palace. Verified: `tsc` + `lint` + tests + `next build`, and
`npm run livecheck` 34/34 on the RTX 5050 (60 fps walk on the iGPU too).

- Walk mode: ambient light swamped the directional light, so every wall was
  the same grey. Now a warm key (SE) + cool fill (NW), low ambient: four
  distinct wall shades. Floor tiles (canvas texture, 1 m), skirting and a
  gold-washed cornice draw the corners; walls take a wash of the room colour.
- Loci are framed medallion plaques on the wall with their number (cached
  canvas textures), not floating spheres. Labels fade beyond 6 m in walk
  mode. The tour route is drawn on the floor. Clicking a plaque glides you
  there. During a tour, graded plaques turn green (recalled) or red (missed).
- Bug: `?tour=1` started in walk order before the due order loaded, then the
  stops re-sorted under the running tour (card for locus 3, camera at locus
  1). Auto tours now wait for the order; a running tour snapshots its stops.
- Bug: `useFetch` kept the previous URL's data after a URL change (palace
  tour room switches). It now resets during render.
- Study: the level map with the card's room + locus lit sits above the card;
  revealing the answer keeps the question visible.
- Palace page: title/description/stats header with Walk palace primary;
  details edit behind "Edit details". Room cards in tour order ("1. Atrium")
  with due count and a learned bar (`roomProgress` in `lib/srs.ts`).
- Palace cards show a ground-floor thumbnail (`groundPlan`, sent by
  `/api/home/summary` as `plans`); delete moved into a "⋯" menu. Home leads
  with the greeting; the redundant stat tiles are gone.
- Room editor: room title as the heading, deck tools grouped, details form
  (and Delete room) below the 3D editor.
- Landing: animated demo palace (a walker follows the study route through the
  doors), the three-step loop, sign-up CTA. Login/signup show Google/Apple
  only when the provider is configured (`getProviders()`).
- Phone walk HUD: touch hints instead of WASD, compact buttons, page actions
  folded into the title card.

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
