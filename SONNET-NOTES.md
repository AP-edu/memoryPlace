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

## NOT verified — needs the PC (real GPU + live clicking)

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

## Decisions made without asking (reasonable defaults, easy to change)

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
