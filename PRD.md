# The Swell Parts Library PRD

Status: Draft v0.1
Date: 2026-07-01
Owner: Brian Eichenberger

## 1. Purpose

Create a small internal website where The Swell members can quickly find their rehearsal parts by song or by assigned role. The product trades the original full band-operations scope for speed: songs, default parts, reusable uploaded assets, and a simple admin workflow backed by Firebase.

This is not the public marketing site and not the full band OS. It is a practical parts-distribution tool that can be deployed quickly to Vercel.

## 2. Primary Users

- Member: opens a part page such as `/parts/voc_3` and sees every song asset assigned to that part.
- Admin: creates songs, uploads files, assigns files to parts, and edits those assignments.

## 3. Goals

- List every song on the front page.
- Give every song a detail page at `/songs/[songSlug]`.
- Give every part a detail page at `/parts/[partSlug]`.
- Upload audio, PDFs, videos, zip files, and related rehearsal files once.
- Assign each uploaded asset to one or more parts for the song.
- Surface the same asset in multiple contexts without duplicate uploads.
- Auto-create default parts for each new song.
- Auto-suggest part assignments from filenames such as `voc_1`, `voc1`, `guit_a`, `guita`, `bass`, or `keys`.
- Keep member navigation simple enough to explain verbally: "Joe, go to `/parts/voc_3`."
- Host on Vercel with Firestore and Firebase Storage.

## 4. Non-Goals

- No full member roster, payroll, tax, logistics, travel, billing, or staffing coverage logic.
- No show bible, public EPK, or marketing-site work.
- No complex role hierarchy beyond admin vs viewer.
- No per-member personalized dashboards in v1.
- No duplicate file uploads for the same chart/demo when one asset belongs to many parts.
- No custom audio editor, waveform editor, or PDF annotation tools.

## 5. Routes

| Route | Purpose |
| --- | --- |
| `/` | Song index with quick links to songs and common parts. |
| `/songs/[songSlug]` | Song page showing all parts and their assigned assets. Admins can upload files and edit assignments here. |
| `/parts/[partSlug]` | Part page showing every song that has assets assigned to that part. |
| `/admin/songs/new` | Create a new song. |
| `/admin` | Lightweight admin index with create-song action and song list. |

Admin controls may appear inline on song pages when the current user is an admin.

## 6. Default Parts

Each new song is created with these default parts:

- `voc_1`
- `voc_2`
- `voc_3`
- `voc_4`
- `voc_5`
- `guit_a`
- `guit_b`
- `bass`
- `keys`

Part labels should display in readable uppercase form:

- `voc_1` -> `VOC 1`
- `guit_a` -> `GUIT A`

Admins can add or remove parts per song later, but the default set should cover the fastest initial workflow.

## 7. Example Song Page

`/songs/i-get-around`

```text
I GET AROUND

vox: i_get_around_vox.pdf
general: IGA_all.mp3
VOC 1: IGA_voc1.mp3
VOC 2: IGA_voc2.mp3
VOC 3: IGA_voc3.mp3
VOC 4: IGA_voc4.mp3
VOC 5: IGA_voc5.mp3
GUIT A: IGA_guitA.mp3, IGA_guitA.mp4
GUIT B: IGA_guitB.mp3
BASS:
KEYS: IGA_keys.mp3
```

In the data model, "vox" and "general" do not need to be special parts. They are ordinary assets assigned to multiple parts. For example:

- `i_get_around_vox.pdf` assigned to `voc_1` through `voc_5`
- `IGA_all.mp3` assigned to all vocal parts and optionally all instrumental parts

## 8. Example Part Page

`/parts/voc_1`

```text
VOC 1

I GET AROUND: IGA_voc1.mp3, i_get_around_vox.pdf, IGA_all.mp3
RHONDA: RHONDA_voc1.mp3, rhondavox.pdf, rhonda_all.mp3
```

Part pages group by song and show only assets assigned to that part for that song.

## 9. Data Model

### `songs/{songId}`

```ts
{
  title: string;
  slug: string;
  sortTitle: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `songs/{songId}/parts/{partSlug}`

```ts
{
  slug: string;
  label: string;
  sortOrder: number;
  assetIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `songs/{songId}/assets/{assetId}`

```ts
{
  filename: string;
  displayName: string;
  contentType: string;
  fileType: "audio" | "pdf" | "video" | "zip" | "other";
  size: number;
  storagePath: string;
  downloadUrl?: string;
  assignedPartSlugs: string[];
  suggestedPartSlugs: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

This nested structure keeps song pages simple and makes all assets song-scoped. Part pages can use a collection group query against `parts`, filtering by part slug document ID or stored `slug`.

## 10. Firebase Storage Paths

```text
songs/{songSlug}/{assetId}-{sanitizedFilename}
```

Files are uploaded directly from the browser to Firebase Storage. The Firestore asset document stores the resulting storage path and metadata.

## 11. Assignment Rules

- Each asset can be assigned to zero or more parts.
- Each part contains zero or more asset IDs.
- On assignment save, update both:
  - `asset.assignedPartSlugs`
  - each affected part's `assetIds`
- If the filename contains a recognizable part token, auto-select those parts before save.
- Filename inference should be helpful but editable; never make it irreversible.

Filename token examples:

| Token variants | Assignment |
| --- | --- |
| `voc_1`, `voc1`, `vocal_1`, `vocal1` | `voc_1` |
| `voc_2`, `voc2`, `vocal_2`, `vocal2` | `voc_2` |
| `guit_a`, `guita`, `gtr_a`, `gtra` | `guit_a` |
| `guit_b`, `guitb`, `gtr_b`, `gtrb` | `guit_b` |
| `bass` | `bass` |
| `keys`, `keyboards`, `piano` | `keys` |
| `vox`, `vocal`, `vocals` | all vocal parts |
| `all`, `full`, `general`, `mix` | all parts, or all vocal parts if admin chooses that setting |

## 12. Auth and Access

v1 decision:

- Public/member pages (`/`, `/songs/*`, `/parts/*`) are accessible to anyone with the URL.
- Admin mutation UI is protected by Firebase Auth using email/password accounts.
- There will be two admin users.
- Admin emails are listed in `NEXT_PUBLIC_ADMIN_EMAILS` so the UI can show admin controls.
- Firestore and Storage writes require an `admins/{uid}` document for the signed-in Firebase Auth user.
- Admins can create songs, upload assets, and assign assets to parts.

## 13. UI Requirements

- Use Next.js App Router, TypeScript, Tailwind, and shadcn/ui.
- Keep the design quiet and utilitarian: compact lists, tables, simple controls, and strong mobile readability.
- Song index should make songs and parts scannable.
- Song page should show parts as rows with assigned asset chips/links.
- Part page should group rows by song.
- Admin upload area should live on the song page and support drag-and-drop.
- Admin assignment editing should be possible immediately after upload and later from the asset row.
- Audio files should be playable inline where practical.
- PDFs/videos/zips should open or download using normal links.

## 14. MVP Build Phases

### Phase 1: Skeleton

- Create standalone Next app.
- Add Tailwind, shadcn/ui, Firebase client setup, and environment template.
- Add static seed data fallback so routes can render before Firebase keys are present.

### Phase 2: Read Paths

- Firestore song index.
- Song detail page with parts and assets.
- Part detail page using collection group lookup.
- Loading and empty states.

### Phase 3: Admin Writes

- Firebase Auth sign-in.
- Admin gate.
- Create song flow with default parts.
- Upload files to Firebase Storage.
- Create asset metadata document.
- Assign assets to parts.

### Phase 4: Polish and Deploy

- Firestore and Storage rules.
- Vercel env documentation.
- Basic smoke tests/build verification.
- Optional import/seed script for starter songs.

## 15. Acceptance Criteria

- Visiting `/` shows a list of songs.
- Visiting `/songs/i-get-around` shows the song title, default parts, and assigned files.
- Visiting `/parts/voc_1` shows all songs with files assigned to `voc_1`.
- Creating a song creates all default parts.
- Uploading `IGA_voc1.mp3` suggests assignment to `voc_1`.
- Uploading `i_get_around_vox.pdf` suggests assignment to all vocal parts.
- Assigning one asset to multiple parts surfaces it correctly on every corresponding part page.
- Build passes locally.
- The app can deploy to Vercel with Firebase environment variables.

## 16. Clarifying Questions

1. Should `all/general/mix` files auto-assign to all parts or only all vocal parts by default?
2. Do you want this as a brand-new GitHub/Vercel repo, or nested inside an existing repo?
3. Do part page URLs need to be exactly `/parts/voc_1`, or should friendly aliases like `/joe` or `/parts/joe` exist later?
