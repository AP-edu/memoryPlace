# Architecture & Lessons Learned — the Quiz Bug Hunt (2026-08-12)

This document tells the full story: how MemoryPlace is structured, how its
APIs actually work, what was actually broken, why it took so long to find,
and what it teaches about working with AI agents. Written the day the quiz
finally worked on both the user and admin accounts.

## 1. How the app is structured

```
app/
  (public pages)
  /login /signup /dashboard /results /admin /profile
  /courses/[id]        course page: decks list + Study links → /quiz/<deckId>
  /decks/[id]          deck page: flashcard CRUD
  /quiz/[deckId]       the quiz (useParams().deckId — MUST match folder name)
  /api/                all server logic lives here (no server components)
    /auth/[...nextauth]    NextAuth credentials sign-in + signup (same file)
    /courses /decks /flashcards /quiz-results   CRUD endpoints
lib/supabase.ts        the ONE Supabase client (service-role key, RLS bypass)
lib/ownership.ts       canModify(): admin bypasses, non-admins own their rows
hooks/useFetch.ts      tiny fetch hook (null URL = no request at all)
proxy.ts               middleware: auth-gates /dashboard /quiz /results etc.
types/database.ts      Deck / Flashcard / Course / QuizResult shapes
scripts/quiz-diagnostic.cjs   read-only DB dump + sanity flags (+ --cleanup)
docs/                  these documents
```

The mental model: **browser → NextAuth session → API route → Supabase**.
There is no direct client-to-DB access in the app; `proxy.ts` guards pages,
routes check `getServerSession`, and each query filters by the session's
`user.id` or `user.role`.

### How an API route works here (the pattern in every route file)

```ts
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ... build a supabase query, possibly owner-filtered:
  // query = query.eq("owner", session.user.id)
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

One subtle trap this caused us: `getServerSession` runs server-side, so a
**broken or missing session silently changes query results** — the client
never gets an error, just "fewer rows" or an empty list.

## 2. Data model & the ownership rule

```
users (custom, via signup route — password bcrypt-hashed)
courses   → owner
decks     → owner, course_id
flashcards → owner, deck_id
quiz_results  → user_id, deck_id, score, total
```

Single most important rule: **almost every query is scoped by the session
user's id**. That rule was applied in three places with three different
semantics over the life of this bug:

- **Cards inside a specific deck** — now UNIVERSAL: `?deck=<id>` returns that
  deck's cards to any logged-in user (that's what the quiz needs).
- **Card/deck/course lists** — owner-scoped (`eq("owner", user.id)`), for
  everyone including admins (changed during this hunt).
- **Mutation** (POST/PUT/DELETE) — moderate: admin bypasses, otherwise the
  row's owner must be the session user (`lib/ownership.ts`, 403 otherwise).

## 3. What was actually broken (three bugs, not one)

| # | Bug | Symptom in the browser | Why it was invisible |
|---|---|---|---|
| 1 | Login email matched case-sensitively (`eq` → `ilike` fixed it) | "Wrong email or password" every time the email capitalization differed from the DB row; once "logged in", everything looked empty | Typing your email the "obvious" way failed; failures are silent (no session = empty lists, not errors) |
| 2 | Non-owners couldn't read a deck's cards (`owner` filter on deck queries) | A user quizzing a deck created by their other account → "no flashcards" | The filter looked intentional ("ownership!"); only cross-account tests show it |
| 3 | **Route folder `[deckid]` vs code `useParams().deckId`** | "This quiz link is missing a deck id." + NO `/api/flashcards` request in the network tab | The page compiled fine; nothing logged an error; the param key mismatch is invisible until you compare the folder name to the destructure |

Plus the follow-up: after renaming the folder on Windows, the **running dev
server kept 404ing `/quiz/*`** until a full restart (case-only renames never
reach the file watcher).

The quiz page code was never "not done" — it was correct, wrong in three
silent ways around it.

## 4. Why it took so long — the traps (very real, all encountered)

1. **The test harness lied.** Initial failures ("signup 500", "login 401")
   were PowerShell 5.1 quirks: piping JSON to `curl.exe` sends UTF-16, which
   corrupts the body. Every API looked broken until moving to
   `--data-binary @file` written explicitly as UTF-8. Lesson: when even the
   happy path "fails", suspect the harpoon before the whale.
2. **The env file had a landmine.** `SUPABASE_SECRET_KEY=... # comment` —
   Next.js strips the comment, hand-rolled parsers didn't → "Invalid API key"
   in scripts only. The app itself was always fine.
3. **"Empty database" was a red herring.** The anon/publishable key returns
   `[]` for everything (RLS hides it all). Only the service-role key shows
   reality. Time was spent trusting anon-key silence before checking.
4. **Test data decayed mid-hunt.** The deck being tested ("The brain") was
   deleted from the UI while we worked; queries returned `[]` for a deck that
   no longer existed. Always re-verify the current data, not the data you
   *remember*.
5. **Sessions expire / get dropped quietly.** A quiz that returns `[]` for a
   "logged in" user with no visible error can be a missing session. Check
   `/api/auth/session` explicitly.
6. **Context switching between code reads and live state.** The file on disk
   said one thing; the long-running dev server could be serving another
   (folder rename → 404 proof). Restart the server after directory surgery.
7. **AI agents remember patterns, not your repo.** Each of the above was
   found by reading the ACTUAL source/docs/env at the moment of the issue,
   not by asking "what's usually wrong with quizzes".

## 5. What this teaches about working with AI agents

- **Ask for verification against the real system, and do it yourself.**
  The definitive proof was curl-level E2E: real signup → real login → real
  course/deck/cards → real GET, run against the live dev server. Reasoning
  about code from memory produced theories; only executing produced facts.
- **Show the agent the failure layer.** A browser screenshot says "quiz
  broken" — the network tab says *which request* failed (or, crucially,
  that none was made at all). The network tab is the first debugging tool.
- **State your environment constraints up front.** Windows + PowerShell 5.1
  + curl.exe + Next.js 16 + Turbopack all have quirks; the agent must read
  the local docs (`node_modules/next/dist/docs/`) because Next 16 differs
  from older versions.
- **Accept that "no code is wrong" is a real answer.** The quiz routes were
  correct; the failures were data, sessions, a param-name typo, and a stale
  server. Insisting the agent "just fix the quiz code" would have missed all
  three.
- **Keep the receipts.** Every claim in this repo's debugging was backed by a
  curl command with a real HTTP status. Write those commands down
  (`scripts/quiz-diagnostic.cjs`, this doc) so the next hunt starts from
  fact, not memory.

## 6. The one-line rules that would have caught each bug instantly

1. Does the route folder segment `[x]` exactly match the `useParams()` key?
2. Is the email comparison case-insensitive (`ilike`)?
3. Does the owner filter belong on *this* query (list vs deck-scoped vs write)?
4. Is the dev server younger than the last folder/file rename?
5. Am I testing against current data (dump first: diagnostic script)?