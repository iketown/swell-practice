# The Swell Parts Library PRD

Status: Draft v0.2
Date: 2026-07-13
Owner: Brian Eichenberger

## 1. Purpose

Create a small internal website where The Swell members can quickly find their rehearsal parts by song, assigned role, or band configuration. The product trades the original full band-operations scope for speed: songs, reusable uploaded assets, members, bands, sparse assignment overrides, and a simple admin workflow backed by Firebase.

This is not the public marketing site and not the full band OS. It is a practical parts-distribution tool that can be deployed quickly to Vercel.

## 2. Primary Users

- Member: opens a personal page such as `/members/ike`, selects a band, and sees the effective parts to learn for every song.
- Admin: creates songs, uploads files, manages members and bands, and assigns song parts using defaults plus band-specific overrides.

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
- Record a member's default parts once per song and inherit them in every band that contains the member.
- Store only band-specific differences as overrides.
- Make uncovered parts visible while editing a band's song assignments.

## 4. Non-Goals

- No payroll, tax, logistics, travel, billing, or capability/proficiency logic.
- No show bible, public EPK, or marketing-site work.
- No complex role hierarchy beyond admin vs viewer.
- No login-specific personalization; member pages are shareable read-only URLs.
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
| `/admin/members` | Member CRUD and contact details. |
| `/admin/bands` | Band CRUD and roster editing. |
| `/assignments/[songSlug]` | Admin assignment board for one song and selected band. |
| `/members/[memberSlug]` | Read-only member page with a band picker and effective parts by song. |

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

### `members/{memberId}`

```ts
{
  firstName: string;
  lastName: string;
  displayName: string;
  slug: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `memberPrivate/{memberId}`

```ts
{
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

The public member document contains only the fields required for navigation and assignment views. Contact details and admin notes are isolated in an admin-only document because member pages are accessible by URL in v1.

### `bands/{bandId}`

```ts
{
  title: string;
  code: string; // unique five-character Nano ID
  memberIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `memberSongDefaults/{memberId_songId}`

```ts
{
  memberId: string;
  songId: string;
  partSlugs: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `bandSongOverrides/{bandId_songId_memberId}`

```ts
{
  bandId: string;
  songId: string;
  memberId: string;
  partSlugs: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

An override row is present only when its `partSlugs` differ from the member-song default. Effective parts are `override?.partSlugs ?? default.partSlugs`. An explicit empty override means the member has no parts for that song in that band.

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
- A member may hold multiple parts for one song.
- The first saved assignment for a member and song becomes that member-song default.
- A member-song default applies in every band containing that member.
- Moving a part updates the selected band's sparse override immediately, without interrupting the assignment flow.
- Administrators can promote one member's current effective parts with "Set as default", or promote every changed member in the current band with "Set all as default".
- Updating a default removes any override that becomes identical to the new default.
- Removing a member from a band does not delete that member's defaults.
- The assignment board shows every effective assignment plus an unassigned zone for uncovered song parts.
- Default part chips use the neutral treatment. Any effective part that is not in that member's default array uses the primary blue treatment and includes a "Changed" text cue.

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
- Admins can create/edit members and bands and write member defaults or band-specific overrides.
- Member pages are read-only and accessible to anyone with the URL under the current v1 access model.

## 13. UI Requirements

- Use Next.js App Router, TypeScript, Tailwind, and shadcn/ui.
- Keep the design quiet and utilitarian: compact lists, tables, simple controls, and strong mobile readability.
- Song index should make songs and parts scannable.
- Song page should show parts as rows with assigned asset chips/links.
- Part page should group rows by song.
- Admin upload area should live on the song page and support drag-and-drop.
- Admin assignment editing should be possible immediately after upload and later from the asset row.
- Assignment editing uses a responsive board: member drop zones plus an unassigned zone. Drag-and-drop is enhanced with click/keyboard assignment controls.
- A band selector and assignment summary remain visible near the board.
- Default and override states are communicated by color, label, and help text.
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

### Phase 5: Members, Bands, and Assignments

- Member CRUD.
- Band CRUD with five-character Nano ID and roster editing.
- Member-song defaults and sparse band-song overrides.
- Song assignment board with coverage state.
- Read-only member pages with a band selector.

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
- Creating a member captures first name, last name, display name, email, phone, and notes.
- Creating a band generates a unique five-character code and supports adding/removing members.
- A first assignment becomes the member's default for that song.
- Moving a part saves a band-only change immediately. Per-member and whole-band default actions promote those changes when the admin is ready.
- A new band inherits existing member-song defaults with no copied assignment rows.
- `/members/[memberSlug]` shows effective parts for the selected band.
- `/assignments/[songSlug]` clearly shows default, override, and uncovered parts.

## 16. Clarifying Questions

1. Should `all/general/mix` files auto-assign to all parts or only all vocal parts by default?
2. Do you want this as a brand-new GitHub/Vercel repo, or nested inside an existing repo?
3. Do part page URLs need to be exactly `/parts/voc_1`, or should friendly aliases like `/joe` or `/parts/joe` exist later?
