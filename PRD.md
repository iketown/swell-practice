# The Swell Parts Library PRD

Status: Draft v0.3
Date: 2026-08-03
Owner: Brian Eichenberger

## 1. Purpose

Create a practical internal website where The Swell members can quickly find rehearsal parts and administrators can plan the physical systems needed to rehearse, record, and perform. The parts library remains intentionally simple, while linked stage-planning and gear-tracking modules grow in phased, separately usable releases backed by Firebase.

This is not the public marketing site and not the full band OS. It is a practical parts-distribution tool that can be deployed quickly to Vercel.

## 2. Primary Users

- Member: opens a personal page such as `/members/ike`, selects a band, and sees the effective parts to learn for every song.
- Admin: creates songs, uploads files, manages members and bands, and assigns song parts using defaults plus band-specific overrides.

## 3. Goals

- List every song on the front page.
- Give every song a detail page at `/songs/[songSlug]`.
- Give every song a separate test mixer at `/songs/[songSlug]/player`.
- Give administrators a live band assignment table at `/assignments`.
- Give administrators a percentage-based timing workspace at `/songs/timing` for totaling arbitrary attributes across every song.
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

- No payroll, tax, travel-booking, billing, or capability/proficiency logic. Gear location, packing, and backline requirements are the only logistics in scope.
- No show bible, public EPK, or marketing-site work.
- No complex role hierarchy beyond admin vs viewer.
- No login-specific personalization; member pages are shareable read-only URLs.
- No duplicate file uploads for the same chart/demo when one asset belongs to many parts.
- No stem trimming, mix exporting, or PDF annotation tools. Waveform editing is limited to song-section annotation boundaries.

## 5. Routes

| Route | Purpose |
| --- | --- |
| `/` | Song index with quick links to songs and common parts. |
| `/docs` | Living system blueprint and, as features ship, operating guides for stage planning, signal routing, inventory, containers, and packing. |
| `/songs/[songSlug]` | Song page showing all parts and their assigned assets. Admins can upload files and edit assignments here. |
| `/songs/[songSlug]/player` | Song-scoped multitrack player that loads one administrator-defined stem mix at a time, kept separate from rehearsal assets. |
| `/assignments` | Canonical band-aware live arrangement table with member-ordered instrument and vocal assignments, multi-instrument Trax assignments, original-recording playback, and stem-player shortcuts. |
| `/songs/inst` | Compatibility redirect to `/assignments`. |
| `/songs/timing` | All-song timeline workspace for assigning arbitrary attributes to percentage ranges and totaling their seconds across the library. |
| `/songs/align` | Admin lyric-alignment library and create flow for a title, pasted lyrics, and source MP3. |
| `/songs/align/[songSlug]` | Song-specific lyric timing editor with ElevenLabs forced alignment, waveform auditioning, autosave, and source resets. |
| `/parts/[partSlug]` | Part page showing every song that has assets assigned to that part. |
| `/admin/songs/new` | Create a new song. |
| `/admin` | Lightweight admin index with create-song action and song list. |
| `/admin/members` | Member CRUD and contact details. |
| `/admin/bands` | Band CRUD and roster editing. |
| `/assignments/[songSlug]` | Legacy compatibility redirect to the canonical `/assignments` board. |
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
  instrumentOrder?: number;
  instrumentAssignments: {
    players: [
      InstrumentAssignment | null,
      InstrumentAssignment | null,
      InstrumentAssignment | null,
      InstrumentAssignment | null,
      InstrumentAssignment | null
    ];
    tracks: InstrumentAssignment[];
  };
  originalRecording?: {
    filename: string;
    contentType: "audio/mpeg";
    size: number;
    storagePath: string;
    downloadUrl: string;
  };
  timingDurationSeconds?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

`timingDurationSeconds` is the whole-song length used by `/songs/timing`. The timing workspace can populate it from the original recording metadata or accept a manually entered `m:ss` value.

### `timingAttributes/{attributeId}`

```ts
{
  label: string;
  visible: boolean;
  orderIndex: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Timing attributes are deliberately open-ended. An administrator can use people such as `Brian`, `Chris`, and `Jackson`, or categories such as `guitar`, `sax`, and `keys`. Visibility changes presentation and totals without deleting saved assignments.

### `songs/{songId}/timingAssignments/{attributeId}`

```ts
{
  segments: Array<{
    startPercent: number; // 0–100
    endPercent: number | null; // null while On is waiting for Off
  }>;
  updatedAt: Timestamp;
}
```

Each segment stores percentages rather than seconds so every song timeline fills the available width. Displayed seconds equal each completed segment's percentage width multiplied by `timingDurationSeconds`. An On boundary with a null Off boundary remains visible and editable but contributes zero sections and zero seconds to every summary. Attribute totals sum completed seconds across all songs; overlaps between different attributes count toward each attribute independently.

Every expanded song uses its existing `originalRecording` MP3 in a custom player. Administrators can upload a missing recording or replace the current one directly from the timing player through the same original-recording upload system used by `/assignments`; both pages read and update the same song field and Storage object lifecycle. The player seek track and every attribute slider share the same horizontal span. Clicking or dragging anywhere on the MP3 seek track moves the playhead continuously so a user can scan the recording. Interacting with a song marks it as the active player, and Space toggles playback for that active song without intercepting text entry or native button behavior. Administrators can pause at a boundary and capture `On`, seek or play forward, then capture `Off`. While paused, dragging a timing handle within three percentage points of the playhead snaps the handle exactly to that playhead position.

`InstrumentId` is one of `guit_a`, `guit_b`, `bass`, `drums`, `keys`, `perc`, `horns`, `strings`, `voc`, `xtra_vox`, `lion`, `accordion`, `cello`, `alto_sax`, `acoustic`, `sax_sect`, `horn_sect`, or `notes`. A stored `InstrumentAssignment` is a non-Notes `InstrumentId` or a Notes object containing `{ kind: "notes", id, title, notes }`. The object keeps each draggable Notes tile’s content separate from the song-level `notes` field. Song-order changes update the song document immediately. Band-specific instrument moves update `bandSongArrangements`; an arrangement without stored instruments initially displays the legacy song-level instrument assignments as its seed. Each member column holds at most one instrument, and the Trax array may contain any number of instruments. Songs without an `instrumentOrder`, including newly created songs, appear after explicitly ordered songs until an administrator reorders the table.

`/assignments` selects a band, orders its member columns by the band’s unique `voc_1` through `voc_5` defaults, and subscribes to both the song collection and that band’s `bandSongArrangements`. The board grows automatically with the viewport up to its wide desktop maximum, avoiding horizontal scrolling whenever the window can accommodate the full table; narrower viewports retain the table’s own horizontal overflow. Every member column shows its vocal part as a compact label or a dash when that member has no vocal assignment. Each song has a persisted Edit vocals toggle, stored in the `showVocals` compatibility field. Turning it on makes assigned vocal labels draggable and renders missing vocals as empty drop boxes. Dropping one assigned part onto another in the same song swaps their parts; dropping it into an empty vocal box moves it there, and dropping it into the shared trash target removes it from the song. Alt/Option-clicking a label while editing toggles its `lead` flag, and any number of parts may be leads. Lead labels use a persistent orange outline without additional text.

The assignment board is publicly readable and appears in the primary navigation for every visitor. Non-admin viewers receive the live table and stem shortcuts in a compact view-only presentation without reorder handles, vocal edit controls, the instrument collection, or active drag-and-drop targets. Firestore independently enforces admin-only writes.

Assigned `guit_a`, `guit_b`, `bass`, `keys`, and `drums` icons are associated with identically named instrument stems. Every assigned `voc_1` through `voc_5` tile is associated with its corresponding vocal stem. The board subscribes to all mixer-track documents so these associations reflect uploaded, shown, non-background stems in real time. While a user hovers an assigned tile, holding Control or Command replaces an available tile with a real “Go to part” link that opens a new browser tab at `/songs/{songSlug}?mix={inst|voc}&part={partSlug}&member={memberSlug}`. For example, Cron’s bass assignment on California Girls links to `/songs/california-girls?mix=inst&part=bass&member=cron`. A visible `?` badge marks an assignment whose mapped stem is not playable or whose specialty instrument has no stem mapping; loading or subscription failures do not falsely mark every stem as missing. A narrow, rightmost Unassigned column after Trax shows each playable mapped instrument stem that is not covered by a band-member slot. These smaller display-only icons use 70% opacity and remain visible when the corresponding tile is in Trax, because Trax does not count as a person assignment.

The page also subscribes to `collaboration/instrument-assignments`. A transactional, renewable 15-second lock in the collaboration document allows only one administrator to change the board at a time. Other open clients keep the page geometry fixed while a small “Assignment in progress” overlay blocks and blurs the table. Completing a move clears the lock and records its exact band and destination in `lastMove`. Every connected client viewing that band outlines the destination icon with a green glow for two seconds. An abandoned lock expires automatically so a disconnected browser cannot leave the board permanently disabled.

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
  displayName: string; // editable stem name, defaults to the filename without its extension
  displayNameIsCustom: boolean;
  contentType: "audio/mpeg";
  size: number;
  storagePath: string;
  downloadUrl: string;
  shown: boolean;
  isBackgroundMix: boolean;
  orderIndex: number;
  stateOverrides: Partial<Record<
    "featured" | "unfeatured" | "default" | "muted" | "practice" | "practiceBackground",
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

### `songs/{songId}/mixerVideos/{videoId}`

```ts
{
  filename: string;
  displayName: string;
  contentType: "video/mp4";
  size: number;
  storagePath: string;
  downloadUrl: string;
  partSlug: string | null; // linked to one player part, or left unassigned
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `songs/{songId}/mixerDownloads/{downloadId}`

```ts
{
  filename: string;
  displayName: string;
  contentType: string;
  fileType: "midi" | "zip";
  size: number;
  storagePath: string;
  downloadUrl: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `lyricAlignments/{songSlug}`

```ts
{
  title: string;
  slug: string;
  sortTitle: string;
  lyrics: string;
  audio: {
    filename: string;
    contentType: "audio/mpeg";
    size: number;
    storagePath: string;
    downloadUrl: string;
  };
  status: "ready" | "aligning" | "aligned" | "error";
  errorMessage?: string;
  createdAt: Timestamp;
  alignedAt?: Timestamp;
  updatedAt: Timestamp;
}
```

`lyricAlignments/{songSlug}/versions/original` stores the immutable JSON returned by ElevenLabs for the current source MP3. `lyricAlignments/{songSlug}/versions/current` stores the editable word and optional syllable timing map plus the global offset. Keeping the two versions separate allows whole-song and line-level resets without changing the original alignment. Replacing the source MP3 creates a new original/current pair only after the replacement upload has received a successful ElevenLabs alignment; until then, the active audio and timing maps remain unchanged.

### `songs/{songId}.mixerMixes`

```ts
Array<{
  id: string;
  name: string;
  trackIds: string[];
  orderIndex: number;
}>
```

Each song can retain any number of uploaded mixer stems and expose multiple player mixes that
reference focused subsets of those stems. A member chooses a player mix before choosing the part
they want to learn or practice. Only the active mix's MP3s are downloaded and decoded.

When no saved mix list exists, the app supplies two editable defaults based on stem filenames:

- `Vocals Mix`: `voc_1`, `voc_2`, `voc_3`, `voc_4`, `voc_5`, and an instrument premix.
- `Instrument Mix`: `guit_a`, `guit_b`, `keys`, `bass`, `drums`, and a vocal premix.

The stem manager can rename these defaults, change their membership, reorder them, or create
additional mixes such as an a cappella mix. Saving the stem manager atomically replaces the
song's mix list. A newly uploaded stem remains available to the administrator but is not silently
added to an already-saved mix.

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

Mixer tracks are intentionally not referenced by song parts and never appear on `/songs/[songSlug]` or `/parts/[partSlug]`. They are isolated stems for synchronized test playback only. Each track has an editable player-facing name that starts as its uploaded filename without the extension; the source filename remains immutable for storage and audit context. Admins can choose which uploaded tracks are available, mark backing tracks as background mixes, drag tracks into playback order, assign them to player mixes, or permanently delete them from the project. A background-mix track remains audible and configurable but is excluded from the player’s selected-part menu, so it can never receive the selected stem’s `featured` or `muted` state.

Mixer videos are uploaded as MP4 files through the same mixer upload drop zone, but do not load into the audio engine. In the stem manager's Videos tab, an admin can link each uploaded video to a song part. When a member selects that linked part in the mixer, its video link appears beneath Play and opens the video in a dialog.

Mixer downloads are MIDI or ZIP files uploaded through the mixer drop zone. They never enter a player mix or load into the audio engine. They appear alongside the available MP3 stems in the song's Download stems dialog, where members download files individually. Administrators can permanently remove them from the Downloads tab in the stem manager.

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

Within the active player mix, the mixer derives three reusable part modes from these six states:

- `Learn Part`: selected stem = `featured`; all other stems = `unfeatured`.
- `Practice Part`: selected stem = `muted`; other selectable stems = `practice`; background mixes = `practiceBackground`.
- `Basic Mix`: all stems = `default`; the selected stem is ignored.

The app-wide default state values are featured `{ volume: 70, pan: -50, muted: false, scale: 2 }`, unfeatured `{ volume: 10, pan: 50, muted: false, scale: 1 }`, default `{ volume: 40, pan: 0, muted: false, scale: 1 }`, muted `{ volume: 70, pan: 0, muted: true, scale: 1 }`, practice `{ volume: 60, pan: 0, muted: false, scale: 1 }`, and practiceBackground `{ volume: 30, pan: 0, muted: false, scale: 1 }`. Scale controls actual waveform row height: a collapsed mono row at scale `1` is a compact 52px strip, and the standard featured row at scale `2` is 104px. The code defaults are used when the dedicated app-wide `songs/global-mixer-defaults/mixerSettings/main` document does not exist. Saving app-wide stem states writes that single document, while each actual song stores only sparse per-stem state overrides. A sparse track override replaces only the supplied fields and inherits every other value from the corresponding app-wide state.

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
  vocalPartByMemberId: Record<string, "voc_1" | "voc_2" | "voc_3" | "voc_4" | "voc_5">;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

The band editor enforces unique default vocal parts. These defaults determine which members appear on `/assignments` and their left-to-right order.

### `bandSongArrangements/{bandId_songId}`

```ts
{
  bandId: string;
  songId: string;
  instrumentAssignments?: SongInstrumentAssignments;
  showVocals: boolean;
  vocalAssignments?: Array<{
    memberId: string;
    partSlug: "voc_1" | "voc_2" | "voc_3" | "voc_4" | "voc_5";
    lead: boolean;
  }>;
  updatedAt: Timestamp;
}
```

An absent `vocalAssignments` field means the song has not been customized and receives the band’s default vocal parts. Once customized, the stored array contains only active assignments, so an explicit empty array represents a song with no assigned vocals.

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
lyric-alignments/{songSlug}/source/{uploadId}-{sanitizedFilename}
```

New mixer MP3 uploads set a one-year immutable browser cache policy because each upload receives a unique track-prefixed storage path. Repeat visits may reuse the cached audio bytes instead of downloading the same stems again.

Files are uploaded directly from the browser to Firebase Storage. The Firestore asset document stores the resulting storage path and metadata.
Deleting an asset removes its primary file and generated video thumbnail from Storage, removes its ID from every part in the song, and deletes its asset document.
Lyric-alignment MP3s are uploaded directly from the browser. The server-only alignment route verifies a signed-in admin, downloads that Storage object, and sends it with the stored plain-text lyrics to ElevenLabs. Replacement MP3s use unique Storage paths so browsers cannot reuse stale audio; after a successful realignment and Firestore update, the prior MP3 is removed.

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
- Firestore and Storage admin access accepts either an `admins/{uid}` document for the signed-in Firebase Auth user or a matching email in the rules-level admin allowlist. The rules allowlist stays synchronized with `NEXT_PUBLIC_ADMIN_EMAILS` while UID documents are provisioned.
- Admins can create songs, upload assets, and assign assets to parts.
- Admins can create/edit members and bands and write member defaults or band-specific overrides.
- Member pages are read-only and accessible to anyone with the URL under the current v1 access model.

## 13. UI Requirements

- Use Next.js App Router, TypeScript, Tailwind, and shadcn/ui.
- Keep the design quiet and utilitarian: compact lists, tables, simple controls, and strong mobile readability.
- Song index should make songs and parts scannable.
- Song page should show parts as rows with assigned asset chips/links.
- Test mixer should draw a waveform for every stem in the active player mix and provide synchronized transport, timeline seeking, per-track volume, and per-track pan. Space toggles play and pause from anywhere in the mixer UI, including after a section or transport button receives focus, without intercepting spaces typed into text fields or other editing controls.
- The player should present three clear sections in order: player mix and selected part, song sections, then a large Play/Pause action with previous-section and next-section controls. It does not show a timeline slider or open-all/close-all controls.
- Changing the player mix should unload the previous mix's audio and load only the stems referenced by the new mix. Each player mix remembers its selected part for the current session.
- Mixer MP3s should download and decode concurrently, revealing each completed waveform instead of withholding all rows until the slowest stem finishes. Until playback is ready, the player should show a waveform-shaped placeholder and visible loaded/total progress with copy that distinguishes loading and decoding from waveform drawing.
- Test mixer should offer `Learn Part`, `Practice Part`, and `Basic Mix` modes plus a remembered selected-stem control. Switching a part mode applies the derived state policy immediately without reloading the audio. In `Practice Part`, the selected stem can use the track-controls dialog for a session-only Unmute/Mute check without changing saved song overrides.
- Every viewport uses a per-track gear button that opens a track-controls dialog with full-width volume and pan sliders, mute and solo buttons, and an OK close action. Render only the first five characters of each track label in a fixed 120px-wide control strip to give the waveform more horizontal room; retain the full name in accessible labels and the dialog. Track controls never expand the waveform row.
- Waveform state scale controls actual row height. The standard `featured` scale is `2` and the standard `unfeatured` scale is `1`, making the selected Learn Part stem exactly twice as tall as the other mono stems.
- The player should expose a compact JSON inspector containing only the song’s saved per-stem exceptions, keyed by readable stem name and state. It should update immediately as an administrator changes a live stem control and show Saving, Saved, or failure feedback.
- Admin-only stem manager should control which uploaded stems are available or marked as background mixes, allow drag ordering with keyboard/touch button alternatives, create and edit player mixes, edit the six global mixer states and sparse per-stem overrides, and confirm before permanently deleting an MP3.
- Admin view should provide a collapsed annotation editor with a title, playhead-to-start/end actions, manual time inputs, save/delete actions, and draggable timeline handles. The shared annotation lane sits directly below the timescale and above every waveform row, leaving the horizontal scrollbar at the bottom. Dragging a start boundary into the previous annotation moves that previous annotation's end to the same time; dragging an end boundary into the next annotation moves that next annotation's start to the same time. Each annotation retains the minimum duration and overlaps remain impossible.
- The admin annotation editor should accept Standard MIDI files containing named marker events, show the extracted section titles and tempo-aware time ranges before saving, and require explicit confirmation before atomically replacing any current annotations. Markers that share a start time should continue into the preview as red conflicts with individual remove actions; import remains disabled only until each conflict is resolved.
- User view should show annotations as compact outlined buttons that contain only the section title and seek to each section's start time. The active section uses the primary blue button treatment and follows the playhead as playback enters each annotation range. In both user and admin views, clicking a section or using the previous/next section controls fits the selected section to roughly 60% of the waveform viewport and centers it with roughly 20% space on each side; sections at the start or end clamp to the available timeline. Selecting a section while playback is running seeks to its start without pausing and keeps that section framed until playback leaves it. Timeline annotation handles are read-only outside admin view.
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
- Visiting `/songs/i-get-around/player` shows only that song's active player-mix stems and plays them in sync.
- Visiting `/assignments` shows one row for every song, including songs created after the assignment page was introduced; `/songs/inst` redirects there.
- Visiting `/songs/timing` shows one accordion row for every song, with collapsed per-attribute summaries and full-width percentage timelines when expanded.
- An administrator can create, rename, hide, show, and delete arbitrary timing attributes without deleting assignments when an attribute is merely hidden.
- Capturing Off completes the pending section with an end handle; changing either handle immediately updates the song summary and cumulative totals in seconds.
- Capturing On at the MP3 playhead creates one pending handle that contributes no time until Off is captured later in the song.
- The MP3 seek track and every attribute slider occupy the same horizontal span, and a paused playhead provides a three-percentage-point snap target for timing handles.
- Clicking or dragging the MP3 seek track moves the playhead, and Space toggles play or pause for the most recently interacted-with song without replacing spaces typed into a field.
- An administrator can upload or replace each song's original MP3 from `/songs/timing`; the change immediately updates the shared original recording shown by `/assignments`.
- Cumulative timing totals include every visible attribute across every song and count overlapping assignments independently.
- An administrator can drag instrument icons into five single-value performer slots or a multi-value Trax area, move assignments between songs, and remove assignments through a persistent trash target.
- Holding Alt/Option while dragging an assigned instrument copies it to the destination without clearing its source assignment.
- Adding a repeated instrument to a song requires confirmation, except for `voc`, which may appear any number of times in one row.
- Every completed instrument move updates Firestore without a separate save action.
- An administrator can drag the handle at the left of a song row to reorder the instrument table, and the new order persists without a separate save action.
- An administrator can upload one original-recording MP3 per song and play it in a dialog; uploading a replacement removes the prior storage object after the new recording is saved.
- An administrator can replace a lyric-alignment MP3 and request a fresh ElevenLabs timing map without changing the active audio or saved timing edits when the replacement upload or alignment fails.
- Moving a lyric word's start earlier into the previous word shortens the previous word to the shared boundary, and moving its end later into the next word pushes that next word's start forward. Moving either boundary away from its neighbor preserves the existing gap.
- The lyric waveform centers a newly selected word and retains that center when zoom changes, but its horizontal scroll position remains fixed while either timing handle is being moved.
- An administrator can open a song-notes dialog from each instrument row, save or cancel edits, and see the empty pencil control become a labeled Notes button after content is saved.
- The instrument collection includes a draggable Notes tile that can occupy a performer slot or the Ableton tracks area; every assigned tile owns a unique ID, title, and note body, displays its title, and opens its own editor when clicked without changing the song’s general notes.
- Every song without saved player mixes receives editable `Vocals Mix` and `Instrument Mix` defaults inferred from its uploaded stem filenames.
- An administrator can change the stems in either default player mix and create, rename, reorder, or remove additional mixes.
- Changing player mixes downloads and decodes only the new mix's stems, and the selected-part menu contains only selectable stems in that mix.
- An admin can hide a mixer stem without deleting it, reorder mixer stems, or permanently remove a stem without changing rehearsal assets.
- An admin can upload MIDI and ZIP files as download-only mixer files. They never enter player mixes, but members can download them individually from the Download stems dialog.
- An admin can mark a stem as `BG mix`; it remains in playback and override editing but cannot appear in the selected-part menu or become the selected Learn/Practice stem.
- An admin can create, update, resize, and delete non-overlapping song annotations, while a viewer can use annotation buttons to seek without editing them.
- A viewer or administrator can choose NORMAL, LOOP, or STOP for selected-annotation playback. NORMAL plays through, LOOP returns to the annotation start, and STOP pauses at its end without blocking playback that starts or seeks beyond it.
- Space toggles play and pause throughout the mixer UI, resumes from the paused position, and does not replace spaces typed into annotation fields. Clicking a section during playback seeks to its start and continues playing.
- Clicking any song-section, previous-section, or next-section button in user or admin view selects a supported zoom level that places the section near the middle 60% of the visible timeline and centers the section whenever the song boundaries allow it.
- An admin can preview named MIDI markers as contiguous annotations, remove conflicting markers directly from the preview, and import the resolved set; saving requires an overwrite confirmation whenever the song already has annotations.
- Selecting a stem and `Learn Part` applies `featured` to that stem and `unfeatured` to the rest; `Practice Part` applies `muted` to the selected stem and `default` to the rest; `Listen` applies `default` to every stem.
- An admin can change a global stem state once and optionally override individual state fields for a specific stem; unspecified override fields continue to inherit the global value.
- Stem names default to the uploaded filename without its extension, are editable in the stem manager, and identify stems throughout the player. From the `xs` through `md` breakpoints, a selectable stem’s name is the select button label and the player uses a narrower controls column to preserve waveform width.
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
- Visiting a legacy `/assignments/[songSlug]` URL redirects to the canonical all-song assignment board.
- Hovering an assigned instrument or vocal while holding Control or Command reveals a “Go to part” link; selecting it opens the song player in a new tab with the correct mix, part stem, and member selected.
- An assignment without a playable matching stem displays a `?` badge, and adding or removing a playable stem updates that badge without refreshing the board.
- A playable `guit_a`, `guit_b`, `bass`, `keys`, or `drums` stem without a matching band-member assignment appears as a faded, non-draggable icon in the Unassigned column and disappears as soon as that instrument is assigned to a member.

## 16. Clarifying Questions

1. Should `all/general/mix` files auto-assign to all parts or only all vocal parts by default?
2. Do you want this as a brand-new GitHub/Vercel repo, or nested inside an existing repo?
3. Do part page URLs need to be exactly `/parts/voc_1`, or should friendly aliases like `/joe` or `/parts/joe` exist later?

## 17. Stage / Setup Designer

Status: Approved for implementation v0.1

Date: 2026-08-02

### 17.1 Purpose

Add a signal-planning workspace to The Swell Parts where an administrator can arrange equipment, expose its physical inputs and outputs, connect those ports with real cables, and see the required cable parts list update with the diagram.

The first planned setup types are a home studio, a live rig, and a video-recording rig. A setup is a reusable plan, not a song and not a scaled architectural floor plan. Its canvas positions communicate approximate stage or signal-flow placement while its ports and cable runs describe the actual patch.

### 17.2 Goals

- Create, name, describe, save, reopen, rename, duplicate, and archive multiple setups.
- Build reusable equipment templates such as a microphone, Behringer X32, stage box, DI, camera, computer, or multichannel snake.
- Model regular, extension, and split analog snakes as one inventory item with two or three independently positioned endpoints and a fixed multicore trunk.
- Upload an optional image for each equipment template to Firebase Storage.
- Place any number of instances of a template on a React Flow canvas without re-uploading its image.
- Configure each node's input and output ports in a modal, including optional labels and visible numbering.
- Collapse nodes for a compact planning view, then expand them inline to inspect port labels, connector types, genders, specifications, and signal types.
- Connect one specific output port to one specific input port with a directional, animated, color-configurable cable edge.
- Describe both physical ends of every cable by connector type and gender.
- Estimate a cable length and record whether that run is already covered, must be rented, or must be bought.
- Map every setup node to a specific owned microphone, D.I., instrument, mixer, or other tagged unit when one has been selected.
- Map each cable run to a specific owned cable label when known, while retaining rent/buy/unplanned fulfillment states.
- Derive a live, route-aware parts list from the setup's cable edges so the diagram and list cannot drift apart.
- Preserve the complete graph and viewport in Firestore and restore the same working view later.
- Warn about physically or electrically suspicious connections while leaving an explicit escape hatch for unusual adapters and intentional exceptions.

### 17.3 Non-Goals for the First Release

- No to-scale stage drawing, room measurements, CAD features, or automatic cable routing around obstacles.
- No simultaneous multi-user editing or cursor presence.
- No electrical load, RF-frequency, network-bandwidth, gain-structure, or acoustic simulation.
- No automatic purchasing or rental-vendor integration.
- No event calendar or cross-event cable reservations.
- No automatic propagation of later template edits into already-saved setup nodes.
- No arbitrary image attachments on every setup instance; images belong to reusable equipment templates in the MVP.

### 17.4 Product Vocabulary

| Term | Meaning |
| --- | --- |
| Setup | One named and saved signal plan, such as `Home Studio` or `Live — Small Stage`. |
| Equipment template | A reusable library definition for a piece of equipment, its image, and its default ports. |
| Owned equipment unit | A specific physical item associated with a template, such as `SM58 #3` or `Radial JDI #1`, which can be assigned to one setup node. |
| Equipment node | A setup-specific snapshot of an equipment template with its own position and permitted port overrides. |
| Snake assembly | One physical multichannel snake represented by two linked endpoint nodes, or three endpoint nodes for a split snake. It remains one inventory and parts-list requirement. |
| Channel key | The stable route identity shared by every snake connector that carries the same channel. Matching keys propagate source labels across endpoints. |
| Port | A physical input or output on equipment. A port has a stable ID, direction, number, optional label, connector, and optional signal type. |
| Connector type | The physical interface family, such as XLR, 1/4-inch TS, 1/4-inch TRS, RJ45, BNC, HDMI, or USB-C. |
| Cable end | The plug or socket on one end of a cable. It has a connector type and gender and must mate with the attached equipment port. |
| Cable run | One physical cable represented by one React Flow edge between two ports. One cable may carry multiple channels, as with an AES50-over-Cat5e run. |
| Parts list | A live view derived from cable runs, with one route-aware row per required physical cable and an optional grouped summary. |

The interface should call edges **cables** or **cable runs**, not connectors. `Connector` is reserved for a cable end or equipment jack so that phrases such as `XLR female → XLR male cable` remain unambiguous.

### 17.5 Routes and Access

| Route | Purpose |
| --- | --- |
| `/setups` | Setup library with create, open, duplicate, rename, and archive actions. |
| `/setups/[setupId]` | Full setup editor with equipment library, canvas, selected-item inspector, and parts list. |
| `/setups/equipment` | Reusable equipment-template library and template editor. |

The MVP is admin-only for both reads and writes because setups can expose internal equipment and inventory details. A later read-only mode may be added for signed-in band members without making setups public-by-URL.

`Setups` appears as a top-level navigation item for administrators. The canvas is desktop-first but its parts list and read-only diagram must remain usable on a phone. Editing on a phone is supported for simple field changes but is not the primary authoring experience.

### 17.6 Core Workflows

#### Create and duplicate a setup

1. From `/setups`, choose `New setup`.
2. Enter a required name and optional description.
3. Start with an empty canvas or duplicate an existing setup.
4. A duplicate receives a new setup ID, appends `Copy` to the source name, retains the source description, graph, cable details, and viewport, and reuses the same equipment images.
5. The duplicate records `sourceSetupId` for provenance but is independent after creation.

#### Add equipment

1. Open the equipment drawer from the editor.
2. Search or filter reusable templates.
3. Click a template to add it automatically, or drag it from the equipment list and drop it at an exact canvas position.
4. The new node snapshots the template name, image reference, port definitions, and display settings. Its resting view is an image-first compact square or short rectangle with triangular input and output handles on opposite sides; expanding it reveals the full labeled patch card.
5. A node may be renamed or have its ports overridden without changing the reusable template.

An administrator can also create a new equipment template from the drawer: enter its name, optional manufacturer/model/category/notes, upload an image, and define inputs and outputs. Uploads show progress and validation errors. Accepted MVP formats are JPEG, PNG, and WebP up to 10 MiB each. From a node's detail modal, an administrator can drop or browse for a replacement icon, drag and zoom a one-to-one crop, and save a 512 × 512 WebP. The same modal accepts multiple uncropped front, rear-panel, port, or control-surface detail photos and displays them in an inline inspection gallery. Saving updates the reusable equipment definition and the current node's icon snapshot; other existing setup icon snapshots remain unchanged until deliberately replaced.

#### Configure equipment ports

Double-clicking a node or choosing `Edit equipment` opens a modal with:

- Node name and optional notes.
- Optional image inherited from the template.
- `Show port numbers` and `Show port labels` toggles, stored per node.
- Separate Inputs and Outputs sections.
- Bulk `Number of inputs` and `Number of outputs` controls that add or remove sequential ports.
- A row for each port with a stable ID, display number, optional label, connector type, connector gender, and optional signal type.
- Reordering controls that work with keyboard and pointer input.

Inputs render on the left and outputs on the right by default. In compact view, each physical port remains a distinct triangular React Flow handle, with dense banks using smaller evenly distributed triangles. Numbers are one-based within each direction. A label never replaces the stable port ID. Reducing the count or deleting a port that has a cable attached requires confirmation and identifies every cable that will also be removed.

#### Configure multichannel snakes

An equipment definition can declare `equipmentKind: "snake"` or `"split-snake"`. A regular or extension snake has two physical endpoints. A split snake has one Side A and two matched Side B endpoints, normally FOH and monitors. The definition stores its fixed physical length, routed channel count, endpoint labels/styles, and exact connector banks.

Every snake port stores an `endpointId` and a `channelKey`. Connectors sharing one channel key are physically joined inside the snake. Connecting `Guitar A` to Side A channel 1 therefore labels every paired connector `Snake ch 1 (Guitar A)`. In a split snake, both Side B channel 1 outputs receive that carried label. Separate send and return paths use different key prefixes.

Adding a snake to a setup creates two or three independently movable React Flow nodes joined by one or two thick, non-editable internal trunk edges. The trunk shows channel count and fixed length, does not animate like a patch cable, and never becomes another cable requirement. External patch cables remain normal selectable edges and determine the derived parts list.

All endpoint nodes share an `assemblyId`, fulfillment source, and exact inventory asset. The Gear list and inventory validator treat the assembly as one physical item. Deleting any endpoint removes the full assembly after confirming its external cables.

#### Connect equipment

1. Drag from a specific output handle to a specific input handle.
2. The app validates direction, port capacity, connector mating, and optional signal-type compatibility.
3. If the connection is permitted, create a directional cable edge and open its editor.
4. Prefill each cable end so it mates with the connected equipment port. For example, an XLR-male microphone output receives an XLR-female cable end.
5. Configure the cable name, end A and end B, optional signal type/channel capacity, color, estimated length, length unit, fulfillment status, and notes.

The normal rule is one cable per physical port. A fan-out must be modeled with an explicit splitter, patch panel, or other equipment node. Suspicious connector or signal combinations show a warning. An administrator may choose `Allow exception` and enter a short reason; exceptions remain visibly marked on the canvas and parts list.

Double-clicking a cable or choosing `Edit cable` opens the same editor. A selected cable can be reconnected to another compatible handle. Deleting a cable immediately removes its parts-list requirement after confirmation.

Selecting a cable reveals draggable grips at its source and destination. Dragging either grip to another compatible unoccupied port repatches the existing cable instead of creating a new one. The edge ID, color, length, fulfillment, assigned inventory label, and notes remain unchanged. The moved physical cable end must mate with the new equipment jack; an incompatible or occupied port rejects the drop and leaves the original route intact.

#### Build the parts list

The parts-list panel updates from the in-memory edge array as cables are added, edited, reconnected, or removed. It provides:

- One detailed row per cable run.
- Cable description in `end A → end B` form.
- `From` equipment and port.
- `To` equipment and port.
- Estimated length and unit.
- Fulfillment status: `Unplanned`, `Owned`, `Rent`, or `Buy`.
- Optional inventory match, exception indicator, and notes.
- A link from a row to select and center its cable on the canvas.
- A grouped summary by cable-end specification and length for packing or rental counts.

The parts list is not stored as a second editable collection. It is always derived from cables, while fulfillment decisions and optional inventory assignments live on their cable edges.

Example derived row:

```text
XLR female → XLR male · Vocal 3 / Output 1 → Stage Box / Input 3 · 25 ft · Rent
```

#### Save and restore

- The editor keeps a controlled in-memory graph and displays `Unsaved`, `Saving`, `Saved`, or `Save failed`.
- The MVP uses an explicit `Save` action so every drag event does not become a Firestore write.
- Leaving with unsaved changes prompts the administrator.
- A small browser-local recovery draft protects against an accidental refresh, but Firestore remains the source of truth.
- Saving strips transient React Flow state such as selection, dragging, measured dimensions, and hover state.
- A save writes one versioned graph snapshot containing nodes, edges, and viewport.
- `revision` prevents one browser tab from silently overwriting a newer save from another tab. A conflict offers reload or save-as-duplicate rather than silently merging graphs.

### 17.7 Canvas and Interaction Requirements

- Use the current `@xyflow/react` package and import its required stylesheet.
- Use a controlled React Flow with custom `equipment` nodes and custom `signalCable` edges.
- Every port renders as a uniquely identified React Flow `Handle`; an edge persists the matching `sourceHandle` and `targetHandle` IDs.
- After a modal adds, removes, reorders, or repositions handles, update React Flow's node internals before relying on edge geometry.
- The default cable path is `smoothstep`, with an arrow marker at the target and a subtle repeating motion in the source-to-target direction.
- Each cable persists its own accessible color. Color is never the only indication of direction, selection, warning, or fulfillment state.
- Honor `prefers-reduced-motion`: stop the repeating animation while retaining the arrow marker and clear source/target labels.
- Provide zoom in/out, fit view, minimap toggle, snap-to-grid toggle, delete, and selection controls.
- Node and cable modals must be fully keyboard usable. Handles require useful ARIA labels such as `Stage Box, input 3, XLR female`.
- Prevent the browser context menu from being the only path to any action.
- On smaller screens, the canvas and parts list switch between tabs rather than forcing an unusably narrow split view.

### 17.8 Connection Rules

Connection validation uses these rules in order:

1. A source must be an output port and a target must be an input port.
2. Source and target cannot be the same physical port.
3. Each physical port accepts at most one cable in the MVP.
4. The cable end connector type must match the connected equipment port's connector type unless an exception is recorded.
5. For gendered connector families, the cable end and equipment port normally have opposite genders. `none` is used for genderless or unspecified connectors.
6. If both ports declare a signal type, incompatible families produce a warning or require an exception.
7. End A and end B may differ, allowing real adapter cables such as XLR-to-TRS.
8. Connector order is normalized only for inventory matching; the source-to-target orientation is preserved for display and signal direction.

Initial connector types should include XLR, Combo XLR/TRS, 1/4-inch TS, 1/4-inch TRS, 3.5 mm TS, 3.5 mm TRS, RCA, speakON, RJ45, BNC, HDMI, USB-A, USB-B, USB-C, optical/TOSLINK, MIDI DIN, IEC, Edison, and Other. RJ45 is the connector; Cat5e/Cat6 is stored as optional cable construction/specification. The catalog must not collapse 1/4-inch TS and TRS into one type.

`Combo XLR/TRS` is a fixed-female, port-only connector type. Its port snapshot accepts either an XLR male cable end or a 1/4-inch TRS male cable end. A cable never has a combo end itself; each cable inventory item continues to record the actual XLR or TRS plug it carries.

Initial signal types should include microphone, instrument, analog line, speaker-level, digital audio, network/control, video, MIDI, power, and Other. Signal type is advisory in the MVP; physical connector compatibility is authoritative unless overridden.

### 17.9 Firestore Data Model

The setup metadata and the serialized graph are separate documents. This keeps setup-library queries small while retaining one atomic graph snapshot for save/restore.

#### `setups/{setupId}`

```ts
{
  name: string;
  description?: string;
  status: "active" | "archived";
  sourceSetupId?: string;
  graphSchemaVersion: 1;
  revision: number;
  nodeCount: number;
  cableCount: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `setups/{setupId}/graphs/current`

```ts
{
  schemaVersion: 1;
  revision: number;
  nodes: SetupNode[];
  edges: CableEdge[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  updatedAt: Timestamp;
}
```

The graph is a versioned, JSON-compatible projection of React Flow's nodes, edges, and viewport, not an unfiltered dump of internal component state. Normal setup saves write the setup metadata and `graphs/current` snapshot in one atomic batch or transaction.

Firestore documents have a 1 MiB hard limit. The client should measure the encoded graph before saving and show a warning at 750 KiB. If real setups approach that threshold, migrate graph nodes and edges to subcollections without changing the setup metadata contract. Uploaded images never live inside the graph document.

#### `equipmentTemplates/{templateId}`

```ts
{
  name: string;
  manufacturer?: string;
  model?: string;
  category?: string;
  notes?: string;
  image?: {
    filename: string;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    size: number;
    storagePath: string;
    downloadUrl: string;
  };
  detailImages?: Array<{
    filename: string;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    size: number;
    storagePath: string;
    downloadUrl: string;
  }>;
  ports: EquipmentPort[];
  showPortNumbers: boolean;
  showPortLabels: boolean;
  version: number;
  status: "active" | "archived";
  createdBy: string;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Templates are archived rather than hard-deleted in the MVP so saved setup snapshots never lose their media. Replacing a template icon and adding reusable detail photos write new uniquely named Storage objects. Existing nodes retain their icon snapshot; the node detail gallery reads the current reusable definition photos from the referenced template.

#### `EquipmentPort`

```ts
type PortDirection = "input" | "output";
type ConnectorGender = "male" | "female" | "none";

type ConnectorSnapshot = {
  typeId: string;
  label: string;
  gender: ConnectorGender;
  specification?: string; // for example Cat6, 110 ohm, or 4-pole
  acceptedCableTypeIds?: string[]; // port-only compatibility, such as XLR or TRS on a combo jack
};

type EquipmentPort = {
  id: string; // stable UUID, never derived from the mutable label or number
  direction: PortDirection;
  number: number;
  label?: string;
  connector: ConnectorSnapshot;
  signalType?: string;
  channelCapacity?: number;
  endpointId?: string; // snake side containing this connector
  channelKey?: string; // shared internal route, for example channel-1
};
```

#### `EquipmentTransportTopology`

```ts
type EquipmentKind = "device" | "snake" | "split-snake";

type EquipmentTransportTopology = {
  kind: "snake" | "split-snake";
  length?: number;
  lengthUnit: "ft" | "m";
  channelCount: number;
  endpoints: Array<{
    id: string;
    label: string;
    style: "box" | "fan" | "tail";
  }>;
};
```

#### `SetupNode`

```ts
type SetupNode = {
  id: string;
  type: "equipment";
  position: { x: number; y: number };
  zIndex?: number;
  data: {
    templateId?: string;
    templateVersion?: number;
    equipmentKind?: EquipmentKind;
    transport?: EquipmentTransportTopology;
    assemblyId?: string;
    transportEndpointId?: string;
    transportEndpointLabel?: string;
    transportPrimary?: boolean;
    transportChannelLabels?: Record<string, string>; // derived display cache
    name: string;
    notes?: string;
    image?: {
      storagePath: string;
      downloadUrl: string;
      contentType: string;
    };
    ports: EquipmentPort[];
    showPortNumbers: boolean;
    showPortLabels: boolean;
  };
};
```

#### `CableEdge`

```ts
type CableEdge = {
  id: string;
  type: "signalCable";
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  animated: true;
  data: {
    name?: string;
    color: string;
    endA: ConnectorSnapshot;
    endB: ConnectorSnapshot;
    signalType?: string;
    channelCapacity?: number;
    cableSpecification?: string;
    estimatedLength?: number;
    lengthUnit: "ft" | "m";
    fulfillment: "unplanned" | "owned" | "rent" | "buy";
    inventoryItemId?: string;
    notes?: string;
    exception?: {
      reason: string;
    };
  };
};
```

React Flow presentation fields such as edge `style` and `markerEnd` are derived from `data.color` and direction at render time rather than duplicated in Firestore.

#### `connectorTypes/{connectorTypeId}`

```ts
{
  label: string;
  family: string;
  usesGender: boolean;
  defaultSignalTypes: string[];
  sortOrder: number;
  status: "active" | "archived";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Equipment ports and cable ends retain a label snapshot so archived or renamed catalog entries do not make old setups unreadable.

#### `cableInventory/{inventoryItemId}`

```ts
{
  name: string;
  endA: ConnectorSnapshot;
  endB: ConnectorSnapshot;
  cableSpecification?: string;
  length: number;
  lengthUnit: "ft" | "m";
  quantityOwned: number;
  owner?: string;
  condition?: "good" | "repair" | "retired";
  notes?: string;
  status: "active" | "archived";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

The inventory model uses one quantity record for interchangeable cables of one specification and length, such as `4 × 25 ft XLR female → XLR male`. The current setup's parts list compares required runs with owned quantities and lengths; it does not reserve stock across different saved variants. Individually tagged cable assets may be added later without replacing the quantity model.

### 17.10 Firebase Storage

Equipment icons and reusable detail photos use unique immutable paths:

```text
setup-designer/equipment/{templateId}/{imageId}-{sanitizedFilename}
```

Storage rules allow admin reads and writes for setup-designer images, limit each upload to 10 MiB, and allow only JPEG, PNG, or WebP. Setup duplication copies Firestore references and never duplicates image bytes. Archived templates retain their current and historical referenced images; permanent cleanup requires a later reference audit.

### 17.11 React Flow Technical Fit

React Flow directly supports the required primitives:

- Custom nodes can render arbitrary equipment content and any number of `Handle` components.
- Multiple same-direction handles are distinguished with unique IDs, which map to each edge's `sourceHandle` and `targetHandle`.
- Dynamic port-count changes require `useUpdateNodeInternals` so connected paths are recalculated.
- Edges support `animated`, per-edge styles, labels, reconnecting, and arrow markers.
- A custom edge built on `BaseEdge` and `getSmoothStepPath` can keep the standard interaction target while providing clearer directional animation, warnings, and labels.
- `ReactFlowJsonObject` is the library's JSON-compatible `nodes`, `edges`, and `viewport` shape. The saved graph follows that structure but persists only stable application fields.
- `isValidConnection` handles fast pre-connection checks; the cable editor performs the fuller domain validation before commit.

Use an application-level controlled state reducer for nodes, edges, dirty state, and future undo/redo. Do not put the entire graph behind a component subscription that causes every node to rerender on every small change.

### 17.12 Error and Empty States

- `/setups` has a useful empty state with `Create first setup` and a short explanation.
- An empty setup opens with the equipment drawer prompt and basic canvas instructions.
- Firebase-not-configured mode may render a non-editable sample setup, but it must not imply that Save succeeded.
- Image upload failure retains the equipment form and offers retry.
- Save failure retains the dirty local graph and offers retry or JSON download for recovery.
- A missing template does not break existing setup nodes because node data is snapshotted.
- A missing image renders an equipment-category placeholder without hiding ports.
- Invalid ports, unresolved exceptions, and inventory shortages remain visible in both the canvas and parts list.

### 17.13 MVP Delivery Phases

#### Phase 1: Domain and library

- Add `@xyflow/react` and its stylesheet.
- Add TypeScript domain types and Firestore converters.
- Add admin-only Firestore and Storage rules.
- Add setup list/create/rename/archive/duplicate flows.
- Add connector catalog and equipment-template library with image upload.

#### Phase 2: Canvas and equipment nodes

- Add the controlled React Flow editor, viewport persistence, controls, and responsive shell.
- Add equipment drawer and reusable custom node.
- Add port modal, numbering/label toggles, dynamic handles, and safe connected-port deletion.

#### Phase 3: Cables and parts list

- Add port-capacity and compatibility validation.
- Add directional animated custom cable edges with per-cable colors.
- Add cable editor, length, fulfillment, exceptions, reconnecting, and deletion.
- Add live detailed and grouped parts-list views.

#### Phase 4: Persistence and hardening

- Add normalized graph serialization, explicit save, local recovery, revision conflicts, and duplicate-from-saved behavior.
- Add reduced-motion, keyboard, focus, ARIA, phone read-only, and failure-state QA.
- Add print-friendly parts list and CSV export if schedule permits.
- Run typecheck, lint, production build, Firebase rules tests, and a representative saved-graph round trip.

#### Phase 5: Inventory matching

- Finalize quantity-record versus individually tagged cable inventory.
- Add cable inventory CRUD, matching by ends/specification/minimum length, allocation within one setup, and shortage summaries.
- Keep manual `Owned`, `Rent`, and `Buy` statuses available when no inventory record is assigned.

### 17.14 Acceptance Criteria

- An administrator can create `Home Studio`, give it a description, reopen it, rename it, duplicate it as an independent variant, and archive it.
- An administrator can create a `Behringer X32` equipment template with an image and multiple numbered/labeled input and output ports.
- The same equipment template can be added to multiple setups without a second image upload.
- Editing an equipment instance does not unexpectedly mutate its reusable template or other instances.
- A node can display numbers, labels, both, or neither while retaining accessible port names.
- Every node preserves its collapsed or expanded state; expanded nodes show the accepted connector and signal details for each input and output.
- Every input/output handle has a stable unique ID, and save/restore reconnects every cable to the same physical port.
- Removing a connected port identifies and confirms deletion of its affected cable runs.
- Dragging from `Vocal 3 / Output 1` to `Stage Box / Input 3` creates one directional cable and one live parts-list row.
- A cable can have different connector types or genders on each end, its own color, an estimated length, notes, and an `Owned`, `Rent`, or `Buy` state.
- Either end of an existing cable can be repatched to a compatible unoccupied port without losing the cable's identity or metadata.
- Signal motion and an arrow agree on source-to-target direction; reduced-motion mode removes continuous animation without obscuring direction.
- A second cable cannot silently occupy an already-used physical port.
- Physically suspicious connections are blocked or visibly overridden with a saved reason.
- Clicking a parts-list row selects and centers the corresponding cable, and editing the cable immediately updates that row.
- The grouped parts list reports correct cable counts without replacing the route-level rows.
- Saving and reloading preserves setup metadata, node positions, port definitions, cable endpoints, cable settings, and viewport.
- Opening the same revision in two tabs cannot silently overwrite a newer saved revision.
- Duplicating a setup duplicates its graph and cable requirements but does not duplicate Firebase Storage objects.
- Normal MVP-size diagrams stay below the graph warning threshold and save within Firestore's document limit.
- Only administrators can read or mutate setup, equipment, connector-catalog, inventory, or setup-image data in the proposed MVP.

### 17.15 Resolved Product Decisions

Approved on 2026-08-02:

1. Every uploaded node becomes a reusable equipment template. Setup nodes snapshot the template so old designs stay stable.
2. A physical port accepts one cable. Fan-out requires an explicit splitter, patch panel, or similar node.
3. Individually identifiable equipment can be labeled and assigned from the first release. Cable runs can also record a specific owned-cable label; structured quantity inventory, automatic matching, and shortage allocation remain Phase 5 work.
4. Setup diagrams, equipment templates, connector types, inventory, and images are admin-only.
5. The editor uses explicit Save with a dirty-state warning and browser-local recovery.
6. Canvas placement represents approximate signal flow or stage position, not a measured floor plan.
7. Suspicious connections may be saved only as visible exceptions with a reason.
8. 1/4-inch TS and TRS remain distinct connector types. RJ45 is the connector type and Cat5e/Cat6 is a separate cable specification.
9. The MVP launches with the in-app parts list. Print and CSV remain Phase 4 stretch work.

## 18. Unified Stage Operations and Gear Tracking Blueprint

Approved on 2026-08-03. This section extends the setup designer into a linked Stage Plot, Signal Router, and Gear Tracker. Where this section conflicts with the earlier Section 17 assumptions about approximate placement, quantity-only cable inventory, or one template image, this section takes precedence.

### 18.1 Product Model

One setup is the shared source of truth for three connected views:

- Stage Plot: scaled physical positions, equipment footprints, groups, waypoints, cable corridors, and measured cable requirements.
- Signal Router: readable logical topology with exact ports, signal direction, expandable groups, and drill-through equipment details.
- Gear Tracker: fulfillment, individually tagged physical assets, ownership, providers, containers, last-known location, packing verification, shortages, and exports.

The key separation is:

1. A `GearDefinition` describes a model or generic kind of item.
2. A `SetupItem` asks for that kind of item in one setup.
3. An `Assignment` says whether an owned asset, an outside provider, or a purchase fulfills the requirement.
4. An `InventoryAsset` represents one real QR-labeled object owned or tracked by The Swell.
5. An `InventoryCheckIn` records where an asset was directly observed at a particular time.

Duplicating a setup creates new setup-item identities while preserving the referenced physical asset IDs. Duplicate and swap changes the assignment without changing the requirement, stage position, ports, cables, or routes.

### 18.2 Stage and Signal Positions

Every setup node can store both:

```ts
{
  stagePosition: { xFeet: number; yFeet: number; widthFeet?: number; depthFeet?: number };
  diagramPosition: { x: number; y: number };
}
```

The Stage Plot owns physical truth and cable measurement. The Signal Router owns readable logical arrangement. Moving a node in the signal view never changes required cable length.

Groups such as Position 1 or Stage-right rack have a physical footprint and summary on the Stage Plot. The same group can expand into its constituent equipment nodes in the Signal Router.

### 18.3 Cable Routes and Waypoints

A setup cable connects exact source and target ports and stores an ordered list of physical route points. Equipment nodes, groups, and dummy routing waypoints can all be route points.

Required length is calculated from orthogonal stage-coordinate segments plus vertical drops and service slack. Shared waypoint pairs form cable corridors. Cables in the same corridor render with stable visual offsets that do not change physical length.

Moving one waypoint recalculates every cable containing it. If an assigned physical cable becomes too short, the setup flags the assignment and offers another compatible owned asset, outside supply, or purchase.

### 18.4 Gear Definitions, Icons, Detail Photos, and Asset Photos

Images have three distinct purposes:

- A `GearDefinition` has one transparent PNG or WebP icon for the Stage Plot, Signal Router, compact lists, and generic external requirements.
- A `GearDefinition` can have several reusable JPEG, PNG, or WebP detail photos showing the product front, rear panel, ports, and controls. These help an administrator verify a signal-flow definition even when no physical owned asset has been assigned.
- An `InventoryAsset` has several JPEG or WebP documentary photos of the actual physical object, including front, back, ports, serial label, QR label, case, wear, damage, and identifying marks.

Duplicated setups reference definition media rather than copying image bytes. Two otherwise identical microphones can share one icon and reusable product-detail gallery while retaining different physical photo galleries.

The definition icon editor accepts drag-and-drop or file browsing. Clicking the current icon opens a square crop interface with pan and zoom controls. The client exports a 512 × 512 WebP, stores it at an immutable equipment-image path, updates the definition, and snapshots that version onto the node being edited.

The node detail modal also provides an inline inspection gallery. Administrators can add up to twelve reusable detail photos, select thumbnails for a larger view, and retain AI-imported web references as a separately labeled source. When a node is assigned to a tagged asset, that asset's documentary photos can later appear in the same viewer as a separate source without being copied into the definition.

### 18.5 Inventory Assets and Assignments

Implementation status: the Signal Router currently supports `Owned`, `Rent`, `Buy`, and `Unplanned` fulfillment plus temporary template-level owned-unit labels. The searchable tagged-asset autocomplete, `Create asset` route, QR codes, location history, and check-in workflow begin with the Gear Tracker build phase and are not yet implemented.

```ts
type Assignment = {
  method: "owned_asset" | "external" | "purchase";
  providedByPartyId: string | null;
  assetId: string | null;
  notes?: string;
};

type Party = {
  id: string;
  displayName: string;
  type: "band_member" | "guest_musician" | "company" | "venue" | "other";
  memberId?: string;
  contact?: Record<string, string>;
  active: boolean;
};

type InventoryAsset = {
  id: string;
  assetTag: string;
  definitionId: string;
  qrCode?: string;
  displayName: string;
  serialNumber?: string;
  ownerPartyId: string;
  attributes: Record<string, unknown>;
  canContainAssets?: boolean;
  currentPlacement?: AssetPlacement;
  effectiveLocationId?: string;
  locationInheritedFromAssetId?: string;
  ancestorContainerIds?: string[];
  lastPlacedAt?: Timestamp;
  active: boolean;
};
```

`assetTag` is the permanent human-facing inventory ID. New assets use an uppercase three-letter prefix and a sequence of at least two digits, such as `HXS-01`. The creation form derives the prefix from the item, scans every existing asset with that prefix including retired assets, and suggests one greater than the highest middle sequence. Cable tags may add a second dash and a two-digit length in feet: `XLR-04-25` means XLR cable 04, 25 ft. The optional length does not participate in sequence allocation. Tags are unique and compared case-insensitively; saved values are canonical uppercase. Search ignores case, spaces, and punctuation, so `trs31`, `TRS-31`, and `tRs31` all find `TRS-31-15`.

Machine-readable labels preserve the same identity. A Code 128 cable barcode encodes the bare tag, while a QR label points to `https://theswell.live/g/{lowercase-asset-tag}`. The short route canonicalizes the tag and opens a phone-first landing page. Signed-out visitors can see only the public asset name and tag, send a note to the gear contact, or sign in. An approved administrator can choose from the four most recently used locations, search the full location directory, create a location inline, and append a QR check-in. Private inventory details and all location-changing actions remain admin-only.

Owners and setup providers use one open-ended `Party` registry rather than hardcoded enums. A party can be a band member, hired musician, venue, backline company, or other person or organization. The same party can own physical assets and be responsible for supplying them to a setup.

A hired guitarist can have specifically tracked guitar, pedal, and cable assets owned by their party record. If Swell does not need to track their exact objects, the same setup requirements can instead use `method: "external"`, the guitarist's `providedByPartyId`, and no `assetId`. Likewise, a drum-kit requirement can be assigned to Cron's tagged kit, a guest drummer's tagged kit, or an untracked backline-company requirement depending on the setup variant.

Shopping list is an assignment method, not an owner. Backline is an outside provider; Swell does not track the backline company's warehouse.

Every cable run is also a setup requirement and can be assigned to one exact tagged cable asset, an outside provider, or a purchase.

### 18.6 Containers and Manifests

Bags, road cases, racks, bins, and trunks are inventory assets with `canContainAssets: true`. A container can be the direct placement destination of another asset.

Expected organization and actual containment remain separate:

- A container manifest lists the assets that belong in the container.
- Actual contents are the assets whose latest direct placement is inside that container.
- Comparing the two produces packed, missing, and extra states.

```ts
type AssetPlacement =
  | { kind: "location"; locationId: string }
  | { kind: "container"; containerAssetId: string };

type ContainerManifest = {
  containerAssetId: string;
  expectedItems: Array<{
    assetId: string;
    required: boolean;
    sortOrder: number;
    notes?: string;
  }>;
  updatedAt: Timestamp;
  updatedById: string;
};
```

Example workflow:

1. Cable Duffle A has a manifest of 14 assigned cords.
2. During teardown, scanning the bag opens its manifest.
3. Each cord is scanned or manually checked into the bag.
4. The bag reports 14 of 14 verified, plus any unexpected extra items.
5. Scanning the bag into Ike's car creates one direct check-in for the bag.
6. Every actual descendant resolves to Ike's car as its effective location through the bag.

Moving a container does not create fake direct-scan events for every child. Child histories may display the inherited movement with provenance such as `Ike's car via Cable Duffle A`. A transaction or trusted server process updates denormalized effective-location snapshots for descendant queries.

Containers may nest, such as pouch to duffle to car. The system rejects containment cycles and initially limits nesting depth to keep resolution and descendant updates predictable.

### 18.7 Check-In Events and Location History

The atomic inventory event remains a check-in observation rather than an asserted move from A to B:

```ts
type InventoryCheckIn = {
  id: string;
  assetId: string;
  destination:
    | { kind: "location"; locationId: string }
    | { kind: "container"; containerAssetId: string };
  checkedInAt: Timestamp;
  checkedInById: string;
  method: "qr_camera" | "manual_single" | "manual_bulk";
  coordinates?: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt: Timestamp;
  };
  operationId?: string;
  setupId?: string;
  packingSessionId?: string;
  notes?: string;
};
```

QR camera scanning, manual single-item check-in, and bulk manual selection create the same event type. A bulk action creates one immutable event per selected asset with a shared operation ID.

GPS is optional supporting context. The user-selected named location or container is the intentional destination. Check-in remains available when location permission is denied or unavailable.

Check-in history is append-only. Corrections append a new observation instead of rewriting history. Asset documents store denormalized last-known direct placement and effective-location snapshots for fast lists.

### 18.8 Packing Sessions and Derived Views

A packing session binds a setup, provider, and destination location. A scan inside the session both appends the normal check-in and verifies the item for that trip.

Derived views include:

- Ike's packing list for a selected setup.
- Items verified in the destination during the current packing session.
- Required items last known somewhere else, including the last observation time.
- Missing items from a container manifest.
- Compatible substitutes and unexpected extras.
- Shopping list requirements.
- Backline-company advance requirements.
- Available inventory filtered by definition, owner, condition, and effective location.

An item being last known in the car does not automatically mean it was verified for the current packing session.

### 18.9 Initial Collections and Storage

```text
/equipmentTemplates/{definitionId}  # current reusable gear-definition catalog
/inventoryAssets/{assetId}
/inventoryAssets/{assetId}/checkIns/{checkInId}
/gearParties/{partyId}
/gearLocations/{locationId}
/purchaseOrders/{orderId}
/containerManifests/{containerAssetId}
/setups/{setupId}
/setups/{setupId}/items/{setupItemId}
/setups/{setupId}/cables/{cableId}
/packingSessions/{sessionId}
/packingSessions/{sessionId}/verifications/{assetId}
```

Firebase Storage paths:

```text
/setup-designer/equipment/{templateId}/{imageId}-{sanitizedFilename}  # current icons and definition detail photos
/gear-assets/{assetId}/{imageId}-{sanitizedFilename}                  # physical-asset photos
```

### 18.10 Documentation Route

`/docs` is the living system guide. It begins as a product blueprint with a partner-friendly overview and expandable technical details. As features ship, the same page gains operating instructions, screenshots, common mistakes, and links into the working tools. Its top-level navigation link is shown only to signed-in administrators and local demo-admin sessions; the route itself is not access-restricted by this navigation decision.

Planned operating guides include:

- How to build and duplicate a setup.
- How to create definitions and register physical assets.
- How to use Stage Plot waypoints and measured cable paths.
- How to route and inspect exact signal connections.
- How to assign owned, backline, and shopping fulfillment.
- How to maintain container manifests and teardown checklists.
- How to scan and manually check in gear.
- How to run a packing session and produce a backline advance.

### 18.11 Delivery Sequence

1. Preserve and harden the working setup editor foundation.
2. Add gear definitions, planned and physical assets, owners, providers, locations, setup assignment, purchasing, receiving, icons, and photo galleries.
3. Add the scaled Stage Plot, groups, waypoints, corridor rendering, and length calculation.
4. Add containers, manifests, nested placement, mobile camera scanning, manual batch check-in, optional GPS, and item history.
5. Add packing sessions, shortages, substitutes, shopping lists, member packing lists, backline advances, and exports.
6. Add offline resilience, correction tooling, date conflict detection, real-device QA, security hardening, and backups.

### 18.12 Resolved Decisions

1. Setup diagrams and inventory editing are admin-only.
2. Stage and signal views share identities but store independent positions.
3. Cable measurement comes only from the physical stage route.
4. Gear definitions own one transparent stage icon and reusable inspection photos; physical assets own separate documentary photo galleries.
5. Every equipment and cable requirement can use an exact asset, outside provider, or purchase assignment.
6. Check-in events are append-only observations with optional GPS context.
7. A container's expected manifest is separate from its actual current contents.
8. Actual descendants inherit a moved container's effective location without receiving fake direct-scan events.
9. A location match and a packing-session verification are separate facts.
10. The `/docs` page remains synchronized with the PRD and evolves into the operating manual.
11. Gear owners and setup providers come from one open-ended party registry, not a fixed list of band members or companies.
12. A planned asset receives its permanent inventory ID before purchase. Intended ownership and physical possession are separate facts.
13. Purchase orders group already-reserved assets; first check-in is the boundary that establishes physical possession and location.

### 18.13 AI-Assisted Equipment Research

An administrator creating reusable equipment may paste a public HTTPS product-page URL into the equipment dialog and request research. The server reads the supplied page, extracts direct reference-photo URLs, and asks an OpenRouter-hosted model for strict structured equipment data. The initial model is `openai/gpt-5.6-terra`, configurable through `OPEN_ROUTER_EQUIPMENT_IMPORT_MODEL`; the credential remains server-only in `OPEN_ROUTER_API_KEY`.

The same workflow edits existing definitions directly from the setup equipment rack. Saving increments the definition version and affects future nodes created from that definition; existing setup-node snapshots remain stable. Removing a preset archives the definition from the rack rather than deleting it, preserving references from existing setup nodes and inventory assets.

The research result may fill:

- Equipment name, manufacturer, model, category, and an original concise description.
- Seller, observed purchase price, currency, display price, source URL, and observation time.
- Exact input and output port groups, including count, label, connector type, connector gender, signal type, channel capacity, and supported specification notes.
- Equipment behavior (`device`, `snake`, or `split-snake`) plus snake length, channel count, endpoint styles, endpoint assignments, and shared channel-route keys.
- Reference product-photo URLs found directly in page metadata or structured data.
- Confidence, warnings, and supporting source URLs.

Research never creates or overwrites equipment automatically. The result populates the existing form for administrator review and editing. The model returns compact port groups, but the trusted server expands every physical connector into an individual `EquipmentPort` record with a stable ID before the draft reaches the editor. The editor operates directly on that exact array and can add another typed bank without flattening mixed connector types into one per-direction default.

Product reference photos remain distinct from both image systems already defined in Section 18.4: they are not the transparent diagram icon and they are not documentary photos of a tagged physical asset. They are source-linked references for the reusable gear definition. A later media-hardening pass may copy approved reference images into Firebase Storage to avoid relying on third-party hotlinks.

The route validates administrator access, permits the demo bypass only on a local non-production origin, blocks private-network source URLs and unsafe redirects, caps downloaded page size, treats page content as untrusted data, uses strict JSON Schema output, and stores model/source provenance with the result. Prices and AI-extracted specifications are observations that must remain visibly reviewable rather than permanent unquestioned facts.

### 18.14 Gear Registry and Procurement Implementation

The first `/gear` vertical slice is implemented around the existing `equipmentTemplates` catalog rather than introducing a duplicate definition collection. The route is admin-only and provides three connected views:

1. **Definitions** — reusable model data, AI research, exact ports, purchase source, icon, and reference/detail photos.
2. **Assets** — permanent individually identifiable planned or physical gear with owner, lifecycle, serial number, physical photos, latest location, source setup, and purchase linkage.
3. **Orders** — grouped vendor purchases with reserved asset IDs, payer and account label, payment state, order number, carrier, tracking number, expected arrival, and milestone dates.

Asset lifecycle values are:

```text
planned -> cart -> ordered -> in_transit -> awaiting_check_in -> active
                                                     \-> cancelled
active -> retired
```

An asset may be assigned to an intended owner while it is still planned or in transit. `currentLocationId` is deliberately absent until a physical observation is available. When the first check-in is recorded, the asset becomes `active`, its current-location snapshot is updated, and an immutable check-in document is appended beneath the asset.

Setup node details query `inventoryAssets` by definition. An administrator can select an existing matching asset, assign an outside provider from `gearParties`, or create a planned asset inside the setup modal. The new asset receives its permanent ID immediately, retains `sourceSetupId`, and is assigned to the node without leaving the setup workflow.

Asset creation suggests the next short human-readable ID from the definition name or model rather than generating a random `SWL-` token. The suggestion remains editable before save, but every newly assigned tag must follow `AAA-01` or the cable form `AAA-01-25`. Existing legacy tags remain readable and editable so deployed labels do not break. Duplicate tags are rejected case-insensitively.

Within one setup, an `inventoryAsset` may fulfill only one equipment node. The invariant applies to every individually reserved lifecycle state, including planned, cart, ordered, in transit, awaiting check-in, and active. The node editor disables assets already assigned elsewhere in the setup and identifies the conflicting node; graph persistence rejects duplicate asset IDs as a final integrity check. Two required units therefore require two distinct asset records, even before purchase.

Current receiving supports manual single-item check-in, individual QR landing-page check-in, and an authenticated multi-item camera session. A camera session locks one named `gearLocation`, decodes Swell QR URLs plus bare Code 128 or Code 39 asset tags on the device, suppresses repeat reads, and appends one immutable `qr_camera` event per recognized asset. All events in the session share an `operationId`; the session ends with a checked-in item summary. Manual asset-tag entry remains available when camera permission is denied or no camera is present. Printable label sheets, manual bulk selection, container inheritance, and correction workflows remain later slices built on the same append-only event model.
