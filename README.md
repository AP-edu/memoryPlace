# memoryPlace

A memory-palace study app: users create courses, organize decks of flashcards inside them, study decks via quizzes, and track results.

## Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Backend**: Supabase (Postgres) — all data flows through `/api/*` route handlers
- **Auth**: NextAuth v4 (credentials, JWT strategy) with bcrypt password hashing
- **Styling**: Tailwind CSS v4

## Getting started

1. `npm install`
2. Create `.env.local` with:

   ```
   SUPABASE_URL=
   SUPABASE_SECRET_KEY=
   NEXTAUTH_SECRET=
   NEXTAUTH_URL=http://localhost:3000
   ```

3. `npm run dev` and open http://localhost:3000

The first registered user automatically becomes an admin (can access `/admin` and see all users' content). Subsequent signups get the `user` role.

## Routes

- `/login`, `/signup` — authentication
- `/dashboard` — your courses (protected)
- `/courses/[id]` — decks inside a course
- `/decks/[id]` — flashcard management
- `/quiz/[deckid]` — study a deck
- `/results` — latest quiz score
- `/admin` — all courses (admin only)

## API

REST endpoints under `/api/courses`, `/api/decks`, `/api/flashcards`, `/api/quiz-results`, `/api/auth/*`. All require a session except signup. Ownership rules: regular users see/manage only their own rows; admins see/manage all.

## Scripts

- `npm run dev` — development server
- `npm run build` / `npm start` — production build
- `npm run lint` — ESLint
