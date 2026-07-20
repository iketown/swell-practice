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
- Give every song a separate test mixer at `/songs/[songSlug]/player`.
- Give every part a detail page at `/parts/[partSlug]`.
- Upload audio, PDFs, videos, zip files, and related rehearsal files once.
- Assign each uploaded asset to one or more parts for the song.
- Let admins remove an asset from every assigned part and permanently delete its uploaded files.
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
- No stem trimming, mix exporting, or PDF annotation tools. Waveform editing is limited to song-section annotation boundaries.

## 5. Routes

| Route | Purpose |
| --- | --- |
| `/` | Song index with quick links to songs and common parts. |
| `/songs/[songSlug]` | Song page showing all parts and their assigned assets. Admins can upload files and edit assignments here. |
| `/songs/[songSlug]/player` | Song-scoped test mixer for up to eight isolated mono or stereo MP3 stems, kept separate from rehearsal assets. |
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

### `songs/{songId}/mixerTracks/{trackId}`

```ts
{
  filename: string;
  displayName: string;
  contentType: "audio/mpeg";
  size: number;
  storagePath: string;
  downloadUrl: string;
  shown: boolean;
  isBackgroundMix: boolean;
  orderIndex: number;
  stateOverrides: Partial<Record<
    "featured" | "unfeatured" | "default" | "muted",
    Partial<{
      volume: number; // 0–100
      pan: number; // -100 left to +100 right
      muted: boolean;
      scale: number; // waveform row-height multiplier
    }>
  >>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `songs/{songId}/annotations/{annotationId}`

```ts
{
  title: string;
  start: number; // seconds from the shared song start
  end: number; // seconds from the shared song start
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Annotations label shared sections of the synchronized mixer timeline. Sections may touch but may not overlap. Administrators can create, edit, resize, and delete them. Viewers can see the same sections and seek to a section start, but cannot change boundaries or stored annotation data. Annotation playback behavior is session-only for both administrators and viewers: `NORMAL` continues through the selected annotation's end, `LOOP` returns to its start after playback crosses its end, and `STOP` pauses at its end. LOOP and STOP arm only while playback is inside the selected annotation, so starting or seeking after that annotation remains unrestricted.

Mixer tracks are intentionally not referenced by song parts and never appear on `/songs/[songSlug]` or `/parts/[partSlug]`. They are isolated stems for synchronized test playback only. Admins can choose which uploaded tracks are shown, mark backing tracks as background mixes, drag tracks into playback order, or permanently delete them from the project. A background-mix track remains audible and configurable but is excluded from the player’s selected-part menu, so it can never receive the selected stem’s `featured` or `muted` state.

### `songs/global-mixer-defaults/mixerSettings/main`

```ts
{
  states: Record<
    "featured" | "unfeatured" | "default" | "muted",
    {
      volume: number; // 0–100
      pan: number; // -100 left to +100 right
      muted: boolean;
      scale: number; // waveform row-height multiplier
    }
  >;
  updatedAt: Timestamp;
}
```

The mixer derives reusable custom mixes from these four states rather than storing a separate mix for every stem:

- `Learn Part`: selected stem = `featured`; all other stems = `unfeatured`.
- `Practice Part`: selected stem = `muted`; all other stems = `default`.
- `Listen`: all stems = `default`; the selected stem is ignored.

The app-wide default state values are featured `{ volume: 70, pan: -50, muted: false, scale: 2 }`, unfeatured `{ volume: 10, pan: 50, muted: false, scale: 1 }`, default `{ volume: 40, pan: 0, muted: false, scale: 1 }`, and muted `{ volume: 40, pan: 0, muted: true, scale: 1 }`. Scale controls actual waveform row height: a collapsed mono row at scale `1` is a compact 52px strip, and the standard featured row at scale `2` is 104px. The code defaults are used when the dedicated app-wide `songs/global-mixer-defaults/mixerSettings/main` document does not exist. Saving app-wide stem states writes that single document, while each actual song stores only sparse per-stem state overrides. A sparse track override replaces only the supplied fields and inherits every other value from the corresponding app-wide state.

The selected-part control also establishes the player’s visual focus independently of the active audio mix: the selected part is at least 2x height and uses its fully saturated part color, while the other selectable parts stay compact and use desaturated versions of their colors. Parts 1–5 use red, yellow/orange, green, blue, and purple respectively. These reusable source colors and their derived muted variants live as CSS custom properties in `src/app/globals.css`. A part can be selected from either the player-level dropdown or the `Select →` action in its waveform row; both controls update the same selected-part state. A background mix always remains light grey on black, has no row-level selection action, is never color-emphasized, and is excluded from selected-part behavior. Clicking or dragging on a waveform seeks or selects a time range only; it does not change the selected part.

For administrators, changing volume, pan, or mute in a stem’s live accordion writes to that stem’s currently active state. For example, changing `voc_1` while `voc_2` is selected in `Learn Part` writes only `voc_1.stateOverrides.unfeatured.volume`. Returning a control to the inherited state value removes that field from the stored override instead of preserving a redundant value. Changes are applied optimistically without rebuilding or interrupting the live audio engine. The `Save moves to overrides` switch defaults off, so changes remain a local draft until `Save overrides` is clicked. `Revert to saved` restores the last loaded or successfully saved snapshot. Turning automatic saving on persists each subsequent change after a short debounce and immediately saves an existing dirty draft. Viewers may adjust playback for their current session but cannot change stored overrides.

### `members/{memberId}`

```ts
{
  firstName: string;
  lastName: string;
  displayName: string;
  slug: string;
  photoUrl?: string;
  photoStoragePath?: string;
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

The public member document contains only the fields required for navigation and assignment views, including an optional square headshot. Contact details and admin notes are isolated in an admin-only document because member pages are accessible by URL in v1.

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
songs/{songSlug}/mixer/{trackId}-{sanitizedFilename}
```

New mixer MP3 uploads set a one-year immutable browser cache policy because each upload receives a unique track-prefixed storage path. Repeat visits may reuse the cached audio bytes instead of downloading the same stems again.

Files are uploaded directly from the browser to Firebase Storage. The Firestore asset document stores the resulting storage path and metadata.
Deleting an asset removes its primary file and generated video thumbnail from Storage, removes its ID from every part in the song, and deletes its asset document.

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
- Test mixer should draw a waveform for each stem and provide synchronized transport, timeline seeking, per-track volume, and per-track pan. Space toggles play and pause from anywhere in the mixer UI, including after a section or transport button receives focus, without intercepting spaces typed into text fields or other editing controls.
- The mixer timescale should support an Ableton-style mouse gesture: dragging up zooms out and dragging down zooms in around the grabbed timeline point, while dragging left moves the waveform viewport later and dragging right moves it earlier. The visible zoom buttons and horizontal scrollbar remain available as direct alternatives.
- Mixer MP3s should download and decode concurrently, revealing each completed waveform instead of withholding all rows until the slowest stem finishes. Until playback is ready, the player should show a waveform-shaped placeholder and visible loaded/total progress with copy that distinguishes loading and decoding from waveform drawing.
- Test mixer should offer `Learn Part`, `Practice Part`, and `Listen` modes plus a remembered selected-stem control. Switching either control applies the derived state policy immediately without reloading the audio. In `Practice Part`, the selected stem exposes a session-only `Unmute`/`Mute` action in its accordion header so a member can check the part without expanding controls or changing saved song overrides.
- Per-track volume, pan, mute, and solo controls should live in collapsed-by-default accordions. The player should provide open-all and close-all actions, while collapsed tracks remain exactly as tall as their waveform rows without blank spacing between waveforms.
- Waveform state scale controls actual row height. The standard `featured` scale is `2` and the standard `unfeatured` scale is `1`, making the selected Learn Part stem exactly twice as tall as the other mono stems. Opening controls may temporarily raise that row to a 104px minimum so the controls never overlap; closing it restores the compact mix-defined height.
- The player should expose a compact JSON inspector containing only the song’s saved per-stem exceptions, keyed by readable stem name and state. It should update immediately as an administrator changes a live stem control and show Saving, Saved, or failure feedback.
- Admin-only stem manager should control which uploaded stems are shown or marked as background mixes, allow drag ordering with keyboard/touch button alternatives, edit the four global mixer states and sparse per-stem overrides, and confirm before permanently deleting an MP3.
- Admin view should provide a collapsed annotation editor with a title, playhead-to-start/end actions, manual time inputs, save/delete actions, and draggable timeline handles. The shared annotation lane sits directly below the timescale and above every waveform row, leaving the horizontal scrollbar at the bottom. Dragging a start boundary into the previous annotation moves that previous annotation's end to the same time; dragging an end boundary into the next annotation moves that next annotation's start to the same time. Each annotation retains the minimum duration and overlaps remain impossible.
- The admin annotation editor should accept Standard MIDI files containing named marker events, show the extracted section titles and tempo-aware time ranges before saving, and require explicit confirmation before atomically replacing any current annotations. Markers that share a start time should continue into the preview as red conflicts with individual remove actions; import remains disabled only until each conflict is resolved.
- User view should show annotations as compact outlined buttons that contain only the section title and seek to each section's start time. The active section uses the primary blue button treatment and follows the playhead as playback enters each annotation range. In both user and admin views, clicking a section fits it to roughly 60% of the waveform viewport and centers it with roughly 20% space on each side; sections at the start or end clamp to the available timeline. Clicking a section while playback is running seeks to its start without pausing and keeps that section framed until playback leaves it. Timeline annotation handles are read-only outside admin view.
- Both user and admin player views should show one row of `NORMAL`, `LOOP`, and `STOP` radio controls for the selected annotation. `NORMAL` is the session default. LOOP and STOP react only to ordinary playback crossing the selected annotation's end; a seek or fresh playback start beyond that end must remain playable.
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
- Visiting `/songs/i-get-around/player` shows only that song's mixer stems and supports synchronized playback for up to eight tracks.
- An admin can hide a mixer stem without deleting it, reorder mixer stems, or permanently remove a stem without changing rehearsal assets.
- An admin can mark a stem as `BG mix`; it remains in playback and override editing but cannot appear in the selected-part menu or become the selected Learn/Practice stem.
- An admin can create, update, resize, and delete non-overlapping song annotations, while a viewer can use annotation buttons to seek without editing them.
- A viewer or administrator can choose NORMAL, LOOP, or STOP for selected-annotation playback. NORMAL plays through, LOOP returns to the annotation start, and STOP pauses at its end without blocking playback that starts or seeks beyond it.
- Space toggles play and pause throughout the mixer UI, resumes from the paused position, and does not replace spaces typed into annotation fields. Clicking a section during playback seeks to its start and continues playing.
- Clicking any song-section button in user or admin view selects a supported zoom level that places the section near the middle 60% of the visible timeline and centers the section whenever the song boundaries allow it.
- An admin can preview named MIDI markers as contiguous annotations, remove conflicting markers directly from the preview, and import the resolved set; saving requires an overwrite confirmation whenever the song already has annotations.
- Selecting a stem and `Learn Part` applies `featured` to that stem and `unfeatured` to the rest; `Practice Part` applies `muted` to the selected stem and `default` to the rest; `Listen` applies `default` to every stem.
- An admin can change a global stem state once and optionally override individual state fields for a specific stem; unspecified override fields continue to inherit the global value.
- An admin changing a live stem’s volume, pan, or mute stores that field under the stem’s currently effective state, while moving it back to the inherited value clears that field. Reloading the song restores the saved effective levels for every viewer.
- The song overrides inspector displays the same sparse override object that the player is currently using.
- Visiting `/parts/voc_1` shows all songs with files assigned to `voc_1`.
- Creating a song creates all default parts.
- Uploading `IGA_voc1.mp3` suggests assignment to `voc_1`.
- Uploading `i_get_around_vox.pdf` suggests assignment to all vocal parts.
- Assigning one asset to multiple parts surfaces it correctly on every corresponding part page.
- Build passes locally.
- The app can deploy to Vercel with Firebase environment variables.
- Creating a member captures first name, last name, display name, email, phone, and notes.
- An administrator can upload and crop a member headshot to a one-to-one square before saving. The processed JPEG is stored at `members/{memberId}/headshot.jpg` and its public URL is recorded on the member document.
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
