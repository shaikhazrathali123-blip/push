# PushQuest

Camera-verified push-up training PWA. Next.js 14 (App Router) frontend + API routes/server actions, Postgres via Prisma, Google sign-in via NextAuth, on-device pose detection with TensorFlow.js.

## Core flow
Google Sign In → Start Workout → Camera counts validated reps on-device → Finish → Stats/XP/Streak update → Leaderboards → Share sticker.

## Stack
- **Frontend/backend**: Next.js 14 App Router, API route handlers, React Server Components for data-heavy pages (Home, Profile, Leaderboard, Friends, Challenges), client components only where interaction/camera is needed.
- **Database**: PostgreSQL via Prisma ORM. Schema in `prisma/schema.prisma` — Users, Workouts, WorkoutSets, Friendships, Challenges, ChallengeParticipants, LeaderboardEntry, UserBadge.
- **Auth**: NextAuth with Google OAuth provider + Prisma adapter (database sessions). Routes are protected by `middleware.ts`.
- **Pose detection**: `@tensorflow-models/pose-detection` (MoveNet Lightning) running on-device via WebGL — see `hooks/usePushupCamera.ts` and `lib/pushup-detector.ts`. No video frame ever leaves the device; only the final rep/set summary is sent to the server.
- **PWA**: `next-pwa` generates the service worker at build time; `public/manifest.json` + icons make it installable.
- **Share cards**: Canvas-rendered transparent PNG stat sticker (`components/ShareCardEditor.tsx`), draggable/resizable/rotatable over a user-uploaded photo, exported with `html-to-image`.

## Getting started

```bash
npm install
cp .env.example .env       # fill in DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID/SECRET
npx prisma db push          # creates tables in your Postgres database
npm run db:seed             # optional: demo users for Leaderboard/Friends
npm run dev
```

### Google OAuth setup
1. console.cloud.google.com → APIs & Services → Credentials → Create OAuth Client ID (Web application).
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and your production URL equivalent).
3. Put the client ID/secret in `.env`.

### Database
Any Postgres instance works (Neon, Supabase, Railway, RDS, local). Set `DATABASE_URL` and run `npx prisma db push` (or `prisma migrate dev` once you're ready to track migrations).

## How the rep counter works
`lib/pushup-detector.ts` is a pure, dependency-free state machine:

```
IDLE → UP → GOING_DOWN → DOWN → GOING_UP → UP (rep +1)
```

Each frame's pose is reduced to: average elbow angle (shoulder–elbow–wrist), and body alignment deviation (shoulder–hip–ankle, plank straightness). A rep only counts when:
- the elbow angle actually crosses below `downElbowAngle` (depth) and back above `upElbowAngle` (lockout),
- the body alignment never sags past `maxBodySag` degrees during the down phase (no hip-piking or sagging),
- the whole rep takes at least `minRepDurationMs` (rejects tracking glitches/fake reps),
- state transitions are debounced across several consecutive frames to ignore single-frame jitter.

Rejected reps are still logged (`invalidReps`) for the lifter's own feedback, but never counted toward XP, streaks, or leaderboards.

## Anti-cheat
- Only `cameraValidated: true` workouts affect `totalPushups`, streaks, best-set PRs, XP, and leaderboard rank.
- The server independently sanity-checks the reported rep rate (`app/api/workouts/route.ts`) against a physiologically plausible ceiling and demotes anything faster to non-competitive.
- Manually logged workouts (no camera) are stored for personal history but flagged `cameraValidated: false` and excluded from ranking queries everywhere.

## Known limitations / what you'll want to finish for production
- `LeaderboardEntry` table is modeled but this build computes leaderboards live on read (`app/api/leaderboard/route.ts`) rather than via a materialized refresh job — fine at moderate scale, add a cron/edge function to pre-aggregate at larger scale.
- `geohash` for "nearby athletes" needs to be computed client-side (e.g. with the `ngeohash` package) from a coarse, user-approved location and written via a small `/api/me` PATCH — the schema and query side are in place, the write path is left as a follow-up since it's a straightforward addition.
- 1v1 challenge notifications/accept-decline flow is modeled (`ChallengeParticipant.opponentId`) but currently auto-joins the invited friend; add an accept step if you want it opt-in.
- No automated test suite is included; `lib/pushup-detector.ts` and `lib/gamification.ts` are pure functions and are the highest-value place to add unit tests first.
- Rate limiting isn't implemented on the API routes — add it (e.g. `@upstash/ratelimit`) before public launch, particularly on `/api/workouts` and `/api/friends`.
