# memoryPlace

A memory-palace study app: design palaces in 2D, walk them in 3D, place loci on walls, attach cards, and reinforce recall with spatial quizzes.

## Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Backend**: Supabase (Postgres) — all data flows through `/api/*` route handlers
- **Auth**: NextAuth v4 (credentials + Google, Apple stub, JWT strategy) with bcrypt password hashing
- **Styling**: Tailwind CSS v4

## Getting started

1. `npm install`
2. Create `.env.local` with:

   ```
   SUPABASE_URL=
   SUPABASE_SECRET_KEY=
   NEXTAUTH_SECRET=
   NEXTAUTH_URL=http://localhost:3000
   # OAuth (prod): register redirect https://<your>.vercel.app/api/auth/callback/<google|apple>
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   # APPLE_ID=
   # APPLE_SECRET=
   ```

3. `npm run dev` and open http://localhost:3000

The first registered user automatically becomes an admin (can access `/admin` and see all users' content). Subsequent signups get the `user` role.

## Routes

- `/login`, `/signup` — authentication (email normalized + validated, `?error=` surfaced)
- `/home` — Palace Overview + due summary (protected)
- `/palaces` — redirect shim → `/home`
- `/palaces/[id]` — 2D blueprint / 3D palace, rooms, study + walk links
- `/palaces/[id]/print` — printable blueprint + copy-text
- `/rooms/[id]` — room editor (loci, cards, openings)
- `/walk/[roomId]`, `/walk/palace/[palaceId]` — first-person walk + guided tour
- `/study/palace/[palaceId]`, `/study/[roomId]` — due-first / walkthrough sessions
- `/quiz/[deckId]` — retained straight-quiz flow
- `/results` — latest quiz score
- `/profile` — stats + continue/weakest links
- `/forgot-password`, `/reset-password/[token]` — password reset
- `/admin` — all palaces (admin only)

## API

REST endpoints under `/api/palaces`, `/api/rooms`, `/api/levels`, `/api/openings`, `/api/loci`, `/api/cards`, `/api/reviews`, `/api/study-sessions`, `/api/home/summary`, `/api/auth/*` (plus `/api/decks`, `/api/flashcards`, `/api/quiz-results` for the retained straight-quiz flow). All require a session except signup. Ownership rules: regular users see/manage only their own rows; admins see/manage all.

## Scripts

- `npm run dev` — development server
- `npm run build` / `npm start` — production build
- `npm run lint` — ESLint
- `npm run test` — vitest run
- `npx tsc --noEmit` — typecheck
