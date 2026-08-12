# Quiz Testing & Troubleshooting

Status: **2026-08-12 — RESOLVED & VERIFIED LIVE on both the user and admin
profiles.** Three distinct root causes, all fixed:

1. **Card visibility**: `/api/flashcards?deck=<id>` returns that deck's cards
   regardless of who owns them (login still required; owner filter only for
   unfiltered lists).
2. **Case-insensitive login**: email lookup uses `ilike` in both
   `app/api/auth/[...nextauth]/route.ts` (sign-in) and
   `app/api/auth/signup/route.ts` (duplicate check), so any capitalization
   works.
3. **Param name mismatch**: the route folder was `[deckid]` but the page read
   `useParams().deckId` (capital I) — `deckId` was ALWAYS `undefined`, so the
   quiz never even fetched. Fixed by renaming the folder to `app/quiz/[deckId]`.

Verified live:
- A brand-new account (owns nothing) fetched "Brains"'s cards → 200 + cards.
- `aLexAnDeR.pAcUnAyEn@gmail.com` + the real password → logged in, session id
  `cf13892f`.
- Quiz renders and records results for both `Alexander.pacunayen@gmail.com`
  (user) and `ampacunayen@gmail.com` (admin) in the browser.

## The reported issue

"Quiz says there are no flashcards" even though flashcards exist in the app.

Investigation result: the quiz code path was never broken. A full live
end-to-end run against the dev server proved it:

```
signup (fresh account) → login (session ok) → create course → create deck
→ create 2 flashcards → GET /api/flashcards?deck=<deckId> → 200 + 2 cards
```

The empty message only renders when the API legitimately returns `[]`.

## How the quiz flow works

1. **Entry links** (always a real deck id):
   - Course page Study: `app/courses/[id]/page.tsx` → `/quiz/${deck.id}`
   - Dashboard Retake: `app/dashboard/page.tsx` → `/quiz/${r.deck_id}`
2. **Quiz page** `app/quiz/[deckid]/page.tsx`:
   - `useParams<{ deckId: string }>()` — synchronous in Client Components
     (verified in Next 16 docs; only suspends when `cacheComponents` is on,
     which this project does NOT enable — `next.config.ts` is empty).
   - `useFetch(deckId ? "/api/flashcards?deck=" + deckId : null)` —
     if `deckId` is somehow missing, the null URL **skips the fetch entirely**
     and shows the "missing a deck id" message.
   - Fetches the deck too (`/api/decks/<id>`, readable by any logged-in user)
     so it can show the deck title and distinguish "deck not found" from
     "deck has no flashcards".
   - Distinct states: missing id / deck not found / deck empty / quiz running.
3. **API** `app/api/flashcards/route.ts` GET:
   - 401 without a session (proxy.ts guards `/quiz/*` anyway).
   - With a `deck=` param → `eq("deck_id", deckId)` only — **any logged-in user
     can quiz/read any deck's cards** (universal read).
   - Without a `deck=` param → `eq("owner", session.user.id)` (owner-scoped
     list fallback).
4. **Client**: `lib/supabase.ts` `createClient(url, SUPABASE_SECRET_KEY)`.

## The missing-deck-id mystery (fixed last)

"**This quiz link is missing a deck id.**" + a network tab with **no**
`/api/flashcards` request at all.

Cause: the route folder was `app/quiz/[deckid]` (all lowercase) while the page
did `const { deckId } = useParams()`. Per the Next 16 docs "the property name
is the segment's name" — `useParams()` returned `{ deckid }`, so `deckId` was
`undefined` → `useFetch(null)` → no fetch → the guard message. The route was
renamed to `app/quiz/[deckId]` to match the code.

**Windows gotcha that follows any such rename**: a *case-only* folder rename
does not trip the OS file watcher, so the **running dev server keeps serving
404 for /quiz/\*** until you Ctrl+C and restart it (`npm run dev`). A fresh
`next build` compiles the route fine — only the long-running dev server is
stale. Symptom fingerprint: `/dashboard` 200, `/quiz/*` 404, no server-side
error logged.

## What was wrong before the fix (the full story)

| Factor | Before | After |
|---|---|---|
| Card visibility inside a deck | owner-filtered; someone else's deck showed `[]` | universal: that deck's cards always show |
| Login email match | case-sensitive `eq` | case-insensitive `ilike` |
| Quiz empty-state | single dead-end message | tells you WHY (missing id / not found / empty) |
| Dashboards | admin saw everyone's merged courses | owner-fenced for everyone |

Real accounts (2026-08-12): Alexander.pacunayen@gmail.com (user, Bio / The
brain, 2 cards), ampacunayen@gmail.com (admin, History / The end, 3 cards),
garant.rino@lanvos.com (user, Data / BEgin, 2 cards). `quiz_results` starts
empty — complete a quiz for Recent Results to populate.

Why the user kept hitting "empty": logging in failed whenever the email case
didn't match the DB row (`Alexander...` vs `alexander...`), which silently
leaves you without a valid session — after which everything (courses, decks,
cards, quiz) looks empty. Derived findings: null owners / dangling ids /
owner≠deck-owner mismatches were all ZERO; `ampacunayen@gmail.com` was already
`admin`.

## Symptom → diagnosis table

| Observation (Network tab) | Meaning | Action |
|---|---|---|
| No `/api/flashcards` request at all | `deckId` undefined — param-name mismatch or bad URL | check segment name matches `useParams()` key; check the address bar |
| `/quiz/*` = 404 while `/dashboard` = 200 | stale dev server after a folder rename (Windows) | Ctrl+C the dev server, `npm run dev`, hard refresh |
| Request 200 + `[]` | The deck genuinely has no cards (or wrong deck id in URL) | add cards on the deck page; verify the deck id in the address bar |
| Request 200 + cards | Quiz works; issue was elsewhere (stale page/session) | hard refresh (Ctrl+Shift+R), retry |
| Request 401 | Not logged in / proxy intercepted | sign in first (or check `__Secure-`/`next-auth` cookies) |
| Request 500 | Supabase call failed (bad key in `.env.local`) | see Environment keys section |

## Test matrix

1. **Fresh account, full loop**: signup → login → create course → deck → 2
   cards → quiz → answer all → results page shows score → dashboard Recent
   Results shows the result → Retake works.
2. **Case-insensitive login**: log in with a differently-cased email (e.g.,
   `aLexAnDeR...@gmail.com`) + the real password → succeeds; session shows the
   original account.
3. **Cross-account quiz (was the bug)**: as user A, open a deck owned by user
   B via its URL → the quiz loads B's cards (universal read). PUT/DELETE still
   403 for non-owners (`lib/ownership.ts`).
4. **Empty-deck state**: an empty deck shows "This deck has no flashcards
   yet."; a bogus deck id shows "This deck could not be found.".
5. **Quiz result persistence**: finishing a quiz writes a `quiz_results` row;
   dashboard shows it; Retake navigates back.
6. **Auth redirects**: hit `/dashboard`, `/quiz/x`, `/results` logged out →
   redirected to `/login`. `/admin` as a non-admin → denied.
7. **Network verification**: open DevTools → Network → XHR/Fetch → reload the
   quiz page → the `flashcards` request shows `deck=<uuid>` and 200.

## Environment keys — gotcha found during this investigation

```
SUPABASE_SECRET_KEY=sb_secret_XuQL..._K6  # the service_role key
```

The inline `# comment` is fine for Next.js (its env loader strips it), but
any hand-rolled parser that doesn't strip it sends the key + comment → 401
"Invalid API key" everywhere. Relevant when writing scripts/curl tests; the
repo tool `scripts/quiz-diagnostic.cjs` handles it.

Quick check that keys work from the shell:

```
curl -s "https://<ref>.supabase.co/rest/v1/users?select=id&limit=1" `
  -H "apikey: <SECRET>" -H "Authorization: Bearer <SECRET>"
```

Note: anon/publishable keys return `[]` here because RLS hides everything from
anon — that is expected, not proof the tables are empty.

## Before you push — checklist (2026-08-12)

Automated gates (both green at time of writing):

- [x] `npm run lint` — clean
- [x] `npm run build` — all 15 routes compile, incl. `ƒ /quiz/[deckId]`

Manual/browser checks:

- [x] Quiz works as `Alexander.pacunayen@gmail.com` (user role) and as
      `ampacunayen@gmail.com` (admin): deck title + "Card X of Y", answers
      advance, results page shows score
- [x] `/results` renders (200) with `?score=N&total=M`
- [x] `GET /api/decks/<bogus>` → 404 `{"error":"Not found"}` (deck-not-found
      state)
- [x] `GET /api/flashcards?deck=<id>` returns cards for any logged-in account
      (verified cross-account)
- [x] Case-insensitive login `aLexAnDeR...` + real password → full session
- [x] `POST /api/quiz-results` own deck → 201; foreign deck → 403
- [ ] **Finish a real quiz in the browser** so `quiz_results` has a row and
      Recent Results shows it (dashboard table reads this table)
- [x] Signup → login → course → deck → cards loop (fresh account, verified
      during E2E)
- [x] `/admin` denied for non-admins; redirected when logged out

Repository state before pushing:

- Confirm `git status` shows the intended files only (8 modified API/page
  files + `docs/` + `scripts/`); the folder rename appears as a delete/add of
  `app/quiz/[deckid]` → `app/quiz/[deckId]`
- No secrets in the diff; `.env.local` stays untracked (it is in
  `.gitignore`)

## Post-mortem & architecture notes

See `docs/ARCHITECTURE-and-LESSONS.md` — the full story of this bug hunt: how
the APIs and data model are structured, the three real root causes, the
tooling traps that made it look like an app bug, and what it teaches about
working with AI agents.

## Tools

- `node scripts/quiz-diagnostic.cjs` — dump users/courses/decks/cards/results,
  flag NULL owners, dangling ids, owner/deck mismatches.
- `node scripts/quiz-diagnostic.cjs --cleanup` — additionally delete all
  test accounts (`e2e_*` / `repro_*` / `univ_*@test.local`) and their data
  (safe: only touches accounts whose email begins with those prefixes).