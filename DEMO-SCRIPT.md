# MemoryPlace — Demo Script & Core Features

Final project demo script. Focused on the core features to know, with accurate architecture wording.
Stack: Next.js 16 (App Router) + React 19 + TypeScript, Supabase (Postgres), NextAuth v4 (JWT strategy), Tailwind CSS v4.

Core mental model: **Browser → NextAuth session → `/api/*` route → Supabase (secret key).**
The frontend never talks to the database directly.

---

## 1. Intro (30 seconds)

> "This is MemoryPlace — a study app based on the memory-palace technique. Users create courses,
> organize decks of flashcards inside them, study with quizzes, and track results. Stack is Next.js,
> Supabase, and NextAuth. All data goes through authenticated API routes — the frontend never talks
> to the database directly."

---

## 2. Core feature walkthrough (the script)

| Time | What to do | What to say |
|------|------------|-------------|
| 0:00–0:45 | Intro | App purpose + stack + architecture one-liner |
| 0:45–3:30 | Live happy path | Login → dashboard → course → deck → quiz → results |
| 3:30–5:30 | Architecture | BFF pattern, ownership model, owner-scoped lists |
| 5:30–6:45 | Technical highlight | JWT callbacks, ownership helper, or param-name bug |
| 6:45–8:00 | Close + Q&A | Wrap-up, buffer |

### Live demo steps (happy path)
1. **Log in** (credentials → signed JWT cookie)
2. **Dashboard** → shows only *my* courses (`/api/courses` filtered by `owner`)
3. Open a **course** → its decks (`/api/decks?course=...`)
4. Open a **deck** → flashcards (`/api/flashcards?deck=...`)
5. **Study** → answer 2–3 quiz questions
6. **Finish** → results page + score saved to `quiz_results` and visible on Dashboard/Profile

### Feature inventory (be ready to demo any of these)
- Sign up (first registered user becomes **admin**; everyone else `user`)
- Login / logout
- Courses: create, list, delete
- Decks: create, list, delete (inside a course)
- Flashcards: create, **edit**, delete
- Quiz: show answer → got it right/wrong → score → auto-saved result → results page
- Profile: stats cards (courses, decks, quizzes, avg score), role badge, last quiz
- Admin: table of courses (owner column), remove any course
- Navbar: role-aware (Admin link only for admins), theme toggle

### What to skip
- Every CRUD operation (you don't need to demo each one)
- Signup flow (unless asked)
- Deep middleware dive
- Long bug-hunt story (20–30 seconds max)
- Env vars / deployment details

---

## 3. Architecture — how auth & data move (say this part well)

### The core pattern (BFF)
```
Browser ──(cookie JWT)──► /api/* route ──(getServerSession)──► Supabase (secret key)
```

- The API routes are the **real security boundary**; the frontend is just a client
- The Supabase **secret key** (`sb_secret_...` / `SUPABASE_SECRET_KEY`) is resolved server-side by
  `createAdminClient()` in `lib/supabase.ts` — it bypasses RLS and **never leaves the server**
- Network tab shows exactly which route failed → easy to debug

### JWT session strategy
- `session: { strategy: "jwt" }` — the session lives in a **signed JWT** (HS256 with `NEXTAUTH_SECRET`)
  in the `next-auth.session-token` cookie. Not encrypted, not stored in a DB
- Two callbacks carry custom fields:
  - **`jwt` callback** — runs at login; copies `id` and `role` onto the token
  - **`session` callback** — runs on every `getServerSession()` / `useSession()`; copies `id` and
    `role` from the token onto `session.user`
- Why: stateless → no session table, no round-trip per request, scales horizontally

### The three auth layers (defense in depth)
1. **Middleware** (`proxy.ts`, Next.js 16's `middleware`) — gates `/dashboard`, `/admin`, `/quiz`,
   `/results`, `/profile` *before the page loads*; `/admin` requires `token.role === "admin"`;
   unauthenticated → redirect to `/login` (custom `pages.signIn` is set)
2. **API routes** — every handler starts with `getServerSession(authOptions)` → `401` if no session
3. **Ownership** — `canModify(session, owner)` in `lib/ownership.ts` → `403` if you're not the owner
   or an admin

### Ownership model
- **Lists** (`/api/courses`, `/api/decks`, flashcards *without* a `deck` param) are always filtered
  by `owner = session.user.id` — **even for admins**. Deliberate scope decision: a clean personal
  product over a multi-user admin view under the time constraint
- **Mutations** (create/update/delete): `canModify()` — admins can change anything, users only their
  own rows. Deck/card creation also verifies the parent (course/deck) belongs to you first
- **Special case:** `GET /api/flashcards?deck=...` has no owner filter — any authenticated user with
  a deck ID can read cards; in normal use the UI only links to your own decks

---

## 4. Key code to point at during the demo

| File | Why it's worth opening |
|------|------------------------|
| `app/api/flashcards/route.ts` | The `if (deckId)` branch — the one route that's open at the API level |
| `lib/ownership.ts` | One source of truth for write permissions (`canModify`) |
| `app/api/auth/[...nextauth]/route.ts` | `authorize` (bcrypt compare) + `jwt`/`session` callbacks |
| `lib/supabase.ts` | Lazy `getSupabase()` → `createAdminClient()` — secret key stays server-side |
| `app/quiz/[deckId]/page.tsx` | `useParams()` + `useFetch(deckId ? url : null)` guard |
| `proxy.ts` | Page-level gate + admin role check + `/login` redirect |

---

## 5. One-liners to memorize

- **Architecture:** "All data access goes through authenticated API routes. Lists are strictly
  owner-scoped for every user, including admins, because we prioritized a clean personal experience
  under the time constraint."
- **JWT:** "The jwt callback puts id and role onto the token at login; the session callback copies
  them onto session.user so every API route can read them."
- **Concurrency:** "Because auth is stateless — a signed JWT in a cookie — every concurrent request is
  verified independently. No session store, no locks, so it scales to any number of serverless
  instances."
- **Debugging:** "The decisive steps were the Network tab, checking the actual session, and verifying
  live data — not just reading the source."

---

## 6. Demo prep & ready answers

### Prep checklist
- [ ] Prod deployed with all env vars: `NEXTAUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
      `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`
- [ ] Two accounts ready: one admin, one user — use **two different browsers** (or incognito);
      the same browser shares one session cookie, so two tabs can't hold two sessions
- [ ] One course with a deck of 4–6 cards already created
- [ ] Network tab open; `lib/ownership.ts` or flashcards route open in the editor

### Likely questions
1. **Why not talk to Supabase directly?** — Ownership logic would move to the client, and the secret
   key would be exposed. The BFF keeps the security boundary on the server.
2. **How do users not see each other's data?** — Every list query filters `owner = session.user.id`;
   mutations go through `canModify`.
3. **Missing deckId?** — `useFetch(null)` skips the request entirely; page shows a clear message.
4. **Admin vs user difference today?** — Admin sees the Admin nav link and can modify any row via
   `canModify`; lists are still owner-scoped for everyone.
5. **Why JWT over DB sessions?** — Stateless, no extra table or lookup per request, scales on
   serverless; the trade-off is manually carrying custom claims via callbacks.
6. **Hardest bug?** — Silent failures: `[deckid]` folder vs `useParams().deckId` mismatch (no request
   made, no error), case-sensitive email login (`eq` → `ilike`), stale dev server on Windows.
