# MemoryPlace — Demo Script & Core Features

Final project demo script. Covers the core features to know and the full authentication/architecture
deep-dive, with accurate wording.
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

## 3. Authentication lifecycle (know this cold)

### Signup (`app/api/auth/signup/route.ts`)
1. Client sends `POST /api/auth/signup` with `{name, email, password}`
2. Handler checks `users` with `.ilike("email", ...)` → **409 if the email already exists**
3. Checks whether *any* user exists (`.limit(1)`) → **first user ever gets `role: "admin"`**,
   everyone after gets `"user"`
4. Password hashed with **bcryptjs (10 rounds)** — plaintext never touches the DB
5. Insert into `users`, then the client calls `signIn("credentials")` to auto-login

### Login (`app/api/auth/[...nextauth]/route.ts`)
1. `signIn("credentials")` → NextAuth calls `authorize()` (line 15)
2. `authorize` looks up the user by email via Supabase, then **`bcrypt.compare(password, user.password)`**
3. On success it returns `{id, name, email, role}` — identity is sealed here
4. NextAuth **signs a JWT** (HS256) with `NEXTAUTH_SECRET` and stores it in an **httpOnly cookie**
   (`next-auth.session-token`, `SameSite=Lax`, `Secure` in prod)
5. Callbacks stamp identity into the token:
   - **`jwt` callback** (line 35): on sign-in, copies `id` / `role` onto the token
   - **`session` callback** (line 42): copies `id` / `role` onto `session.user` for the browser

**Key point:** after login the server holds **no session state**. Everything about the user lives
inside the signed JWT cookie.

### Every subsequent request — the three verification layers
1. **Middleware** (`proxy.ts`): `withAuth` decodes the cookie JWT (same `NEXTAUTH_SECRET`) before the
   page loads. No/expired token → redirect to `/login` (custom `pages.signIn` is set);
   `/admin` additionally requires `token.role === "admin"`. Pure crypto, no DB call.
2. **API routes**: every handler starts with `getServerSession(authOptions)` → decodes the cookie →
   **401** if null.
3. **Ownership** (`lib/ownership.ts`): `canModify(session, owner)` → **403** unless you're the row
   owner or an admin.

### The full JWT flow (memorize this)
1. User submits email + password
2. `authorize` runs → returns `{ id, name, email, role }`
3. `jwt` callback runs → copies `id` and `role` onto the token
4. Token is signed and stored in the cookie
5. Later, an API route calls `getServerSession()`
6. `session` callback runs → copies `id` and `role` from token onto `session.user`
7. Route can now use `session.user.id` and `session.user.role`

One-sentence version: *"Because we use the JWT strategy, the jwt callback puts our custom id and role
onto the token at login, and the session callback copies them onto session.user so every API route
can read them."*

---

## 4. How data moves end-to-end

### Create a course
```
Dashboard form
  → POST /api/courses {title}
  → getServerSession() decodes cookie JWT → session.user.id
  → getSupabase() = createAdminClient()   (secret key from server env only)
  → INSERT INTO courses {title, owner: user.id}
  → 201 → client refetches GET /api/courses (now filtered to your id)
```

### Take a quiz
```
/quiz/[deckId] → GET /api/flashcards?deck=X (any authenticated user can read)
  → Q/A runs client-side, score accumulates in React state
  → last card: POST /api/quiz-results {deck_id, score, total}
    → handler verifies deck.owner === session.user.id (403 if not)
    → INSERT INTO quiz_results {deck_id, user_id, score, total}
  → router.push(/results?score=..&total=..)
```

### Where the secret key lives
`lib/supabase.ts` uses `createAdminClient()` from `@supabase/server/core` — it resolves
`SUPABASE_URL` + `SUPABASE_SECRET_KEY` (`sb_secret_...`) from server env and is **never bundled to
the client**. All Supabase access is server-to-server; the browser only ever talks to Next.js route
handlers.

---

## 5. Architecture — the talking points

### The core pattern (BFF)
```
Browser ──(cookie JWT)──► /api/* route ──(getServerSession)──► Supabase (secret key)
```
- The API routes are the **real security boundary**; the frontend is just a client
- Ownership and permission logic live in one place → hard to get wrong, easy to debug
- Secret key bypasses RLS server-side and **never leaves the server**

### Ownership model
- **Lists** (`/api/courses`, `/api/decks`, flashcards *without* a `deck` param) are always filtered
  by `owner = session.user.id` — **even for admins**. Deliberate scope decision: a clean personal
  product over a multi-user admin view under the time constraint
- **Mutations** (create/update/delete): `canModify()` — admins can change anything, users only their
  own rows. Deck/card creation also verifies the parent (course/deck) belongs to you first
- **Special case:** `GET /api/flashcards?deck=...` has no owner filter — any authenticated user with
  a deck ID can read cards; in normal use the UI only links to your own decks

### Concurrency — why it works (demo point b)
- Auth is **stateless**: every concurrent request carries its own signed proof
- Vercel can run many serverless instances; each verifies independently — **no shared session store,
  no locks, no race conditions on identity**
- `getServerSession` is pure decode + verify per request
- Writes are atomic Postgres inserts (Supabase) — concurrent creates from different users can't
  corrupt each other
- **Demo:** two browsers side by side (Chrome = admin, Edge/incognito = user), fire requests from
  both simultaneously — each resolves with its own identity and ownership rules; refresh keeps each
  session intact

### Honest tradeoffs (only if asked)
- RLS is bypassed (admin client) — ownership is enforced in the API layer instead of the DB
- The same browser can't hold two sessions at once (cookie is per-browser, not per-tab)
- `POST /api/quiz-results` checks owner only, no admin bypass — admin can't save results on decks
  they don't own

---

## 6. Key code to point at during the demo

| File | Why it's worth opening |
|------|------------------------|
| `app/api/flashcards/route.ts` | The `if (deckId)` branch — the one route that's open at the API level |
| `lib/ownership.ts` | One source of truth for write permissions (`canModify`) |
| `app/api/auth/[...nextauth]/route.ts` | `authorize` (bcrypt compare) + `jwt`/`session` callbacks |
| `lib/supabase.ts` | Lazy `getSupabase()` → `createAdminClient()` — secret key stays server-side |
| `app/quiz/[deckId]/page.tsx` | `useParams()` + `useFetch(deckId ? url : null)` guard |
| `proxy.ts` | Page-level gate + admin role check + `/login` redirect |
| `types/next-auth.d.ts` | TypeScript module augmentation — `session.user.id` and `role` are typed |

---

## 7. One-liners to memorize

- **Architecture:** "All data access goes through authenticated API routes. Lists are strictly
  owner-scoped for every user, including admins, because we prioritized a clean personal experience
  under the time constraint."
- **JWT:** "The jwt callback puts id and role onto the token at login; the session callback copies
  them onto session.user so every API route can read them."
- **Concurrency:** "Because auth is stateless — a signed JWT in a cookie — every concurrent request is
  verified independently. No session store, no locks, so it scales to any number of serverless
  instances."
- **Security:** "Passwords are bcrypt-hashed at rest, the session is a signed JWT in an httpOnly
  cookie, and the Supabase secret key never leaves the server."
- **Debugging:** "The decisive steps were the Network tab, checking the actual session, and verifying
  live data — not just reading the source."

---

## 8. Demo prep & ready answers

### Prep checklist
- [ ] Prod deployed with all env vars: `NEXTAUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
      `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`
- [ ] Two accounts ready: one admin, one user — use **two different browsers** (or incognito);
      the same browser shares one session cookie, so two tabs can't hold two sessions
- [ ] One course with a deck of 4–6 cards already created
- [ ] Network tab open; `lib/ownership.ts` or flashcards route open in the editor

### Hands-on checks before the demo
1. Log in → Network tab → reload dashboard → confirm `/api/courses` and `/api/decks` return only
   your data
2. Start a quiz → confirm `/api/flashcards?deck=...` appears and returns cards
3. Log out → try `/dashboard` or `/quiz/...` → confirm redirect to `/login`
4. As a normal user, try to modify something that isn't yours (second account) → confirm **403**
5. Two browsers, two accounts, refresh both → each keeps its own session

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
6. **What about concurrent requests?** — Stateless JWT: each request verified independently, no
   session store or locks; two browsers with two accounts can operate simultaneously without
   interfering.
7. **Hardest bug?** — Silent failures: `[deckid]` folder vs `useParams().deckId` mismatch (no request
   made, no error), case-sensitive email login (`eq` → `ilike`), stale dev server on Windows.
