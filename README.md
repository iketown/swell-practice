# The Swell Parts

Small internal song-parts library for The Swell. It uses Next.js, shadcn/ui, Tailwind, Firestore, and Firebase Storage.

## Local Setup

```bash
cp .env.example .env.local
pnpm install --ignore-scripts
pnpm dev
```

Without Firebase env vars, the site renders demo seed data so routes can be reviewed immediately.

## Firebase

Create a Firebase web app and fill in the `NEXT_PUBLIC_FIREBASE_*` values. Enable:

- Firestore
- Firebase Storage
- Firebase Auth with Email/Password sign-in

Admin UI is gated two ways:

- Create the two admin users in Firebase Authentication using email/password.
- Add those two emails to `NEXT_PUBLIC_ADMIN_EMAILS` as a comma-separated list.
- Create an `admins/{uid}` Firestore document for each admin user's Firebase Auth UID.

That means Vercel/UI and Firebase rules both know who can administer the library. Public song and part pages remain unauthed/read-only.

## Routes

- `/` song index
- `/songs/[songSlug]` song detail, admin upload, asset assignments
- `/parts/[partSlug]` all songs for one part
- `/admin` create song
