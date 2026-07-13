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

Video playback is streamed directly from Firebase Storage. Thumbnail capture uses a browser canvas, so apply the included CORS policy to the Storage bucket once after authenticating with Google Cloud:

```bash
gcloud storage buckets update gs://the-swell-live.firebasestorage.app --cors-file=storage.cors.json
```

The policy allows public `GET` and `HEAD` media requests from any origin, matching the app's public-read asset rules. It does not grant upload or delete access.

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
