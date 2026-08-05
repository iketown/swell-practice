# The Swell Parts

Small internal song-parts library for The Swell. It uses Next.js, shadcn/ui, Tailwind, Firestore, and Firebase Storage.

## Local Setup

```bash
cp .env.example .env.local
pnpm install --ignore-scripts
pnpm dev
```

Without Firebase env vars, the site renders writable local demo data so routes can be reviewed immediately. In a configured workspace, append `?demo=1` to an admin or assignment URL to review the sample member/band workflow without reading or writing Firebase.

## Mixer Stem Encoding

Use [docs/MIXER_STEM_ENCODING.md](docs/MIXER_STEM_ENCODING.md) when exporting
and batch-converting WAV stems for the song mixer. It defines the house MP3
presets, synchronization rules, FFmpeg commands, and AppleScript converter
requirements.

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
- Create an `admins/{uid}` Firestore document for each admin user's Firebase Auth UID when possible. Firestore and Storage rules also recognize the two configured admin emails as a fallback, so existing admins are not locked out while those documents are being provisioned.

That means Vercel/UI and Firebase rules both know who can administer the library. Keep the email allowlists in `firestore.rules` and `storage.rules` synchronized with `NEXT_PUBLIC_ADMIN_EMAILS`. Public song and part pages remain unauthed/read-only.

## Routes

- `/` song index
- `/songs/[songSlug]` song detail, admin upload, asset assignments
- `/parts/[partSlug]` all songs for one part
- `/admin` create song
- `/admin/members` create and edit members
- `/admin/bands` create bands and manage their rosters
- `/assignments` manage live instrument and vocal assignments for the selected band
- `/songs/inst` and `/assignments/[songSlug]` redirect to `/assignments`
- `/members/[memberSlug]` shows one member's current matrix assignments for a selected band, with direct song-player links

## Assignment Model

- `members` stores the public name, display name, slug, and optional square headshot for each person. Headshots are cropped in the admin editor and stored at `members/{memberId}/headshot.jpg`.
- `memberPrivate` stores admin-only email, phone, and notes under the same document ID.
- `bands` stores a five-character code, member IDs, and each member's default vocal part.
- `bandSongArrangements` stores the selected band's instrument matrix and per-song vocal assignments.
- `songs.published` controls public visibility. New songs and legacy documents without the field are published by default; unpublishing preserves every stem, asset, assignment, and timing record.

The `/assignments` matrix is the source of truth for member pages. A member's instrument and vocal come from that person's matrix column. Vocal assignments are always editable for administrators; double-clicking an empty vocal box restores the member's band-default part, and uploaded vocal stems without an assignment appear in the Unassigned column. Legacy `memberSongDefaults` and `bandSongOverrides` documents are no longer read by member pages.
