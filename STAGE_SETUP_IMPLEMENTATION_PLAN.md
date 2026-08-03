# Stage / Setup Designer Implementation Plan

Status: Ready to implement

Date: 2026-08-02

Source requirements: `PRD.md`, Section 17

Scope update, 2026-08-03: PRD Section 18 extends this foundation into a scaled Stage Plot and individually tagged Gear Tracker. Section 18 supersedes this file where it previously assumed approximate-only placement, quantity-only cable inventory, or a single undifferentiated equipment image. The working signal-editor foundation remains valid.

## 1. Outcome

Deliver an admin-only setup workspace inside `swell-parts` where an administrator can:

- Maintain reusable equipment templates and images.
- Place equipment on a React Flow canvas.
- Configure stable, numbered, labeled input and output ports.
- Draw and edit physical cable runs between specific ports.
- See route-level and grouped cable requirements update immediately.
- Save, recover, duplicate, archive, and reopen complete setups.

The implementation is complete when the approved acceptance criteria in PRD Section 17.14 pass, not merely when a sample diagram renders.

## 2. Approved Decisions

- Setup content and images are readable and writable only by administrators.
- Equipment is reusable through templates. Setup nodes hold snapshots and never change implicitly when a template changes.
- Each physical port accepts one cable. Splitters and patch panels are explicit equipment.
- Inventory uses quantity-by-specification records, not one document per tagged cable.
- Saving is explicit, with local crash recovery and revision conflict detection.
- Canvas positions are approximate; there is no measured floor plan in the MVP.
- Compatibility exceptions are allowed only with a saved reason and visible warning.
- TS and TRS are distinct. RJ45 connector type is separate from Cat5e/Cat6 cable construction.
- The route-level and grouped in-app parts list is required. Print and CSV are stretch work.

## 3. Experience Direction

Physical scene: an administrator is planning a show on a laptop or wide monitor in a rehearsal room, moving quickly between the stage patch and a packing list while other people ask questions.

Use the existing warm light theme, compact typography, restrained blue accent, and direct-manipulation vocabulary. Do not restyle the rest of the application or introduce a dark technical-tool theme. The canvas should feel like a work surface, not another card in the page.

### Desktop editor layout

```text
┌──────────────────────────────── setup toolbar ───────────────────────────────┐
│ Equipment library │                     Canvas                    │ Inspector │
│ search + templates│        nodes, ports, cables, controls         │ Cable /   │
│ 240–280 px        │                flexible width                 │ Parts list│
│                   │                                               │ 320–380 px│
└───────────────────────────────────────────────────────────────────────────────┘
```

- The equipment library is persistent on wide screens and a Sheet on narrow screens.
- The center canvas receives most available width and height.
- The right panel switches between `Inspector` and `Parts list` tabs.
- Node configuration uses the requested Dialog because it contains a focused, potentially large port form.
- Frequent cable edits use the inspector on desktop to avoid repeated modal interruption. On small screens the same form opens in a Sheet or Dialog.
- The setup library and equipment-template library use the normal `AppShell` width.
- The editor uses a new workspace-width `AppShell` variant while reusing the same header and authentication behavior.

### Responsive behavior

- At desktop widths, render the three-region workspace.
- At tablet widths, collapse the equipment library into a Sheet and keep canvas plus inspector.
- On phones, show `Canvas` and `Parts` as separate tabs; equipment and edit forms use Sheets or Dialogs.
- Phone support prioritizes reading the plan, checking fulfillment, and making simple edits. Building a large diagram remains desktop-first.

## 4. Dependencies and Component Inventory

### Runtime package

- Add `@xyflow/react` using pnpm.
- Import the package stylesheet from the setup route layout or another App Router-supported global CSS entry.
- Do not add Zustand for the MVP. A focused reducer plus React Flow's `applyNodeChanges` and `applyEdgeChanges` is sufficient and keeps the new state isolated.

### shadcn components

Reuse installed `Button`, `Dialog`, `AlertDialog`, `Tabs`, `Table`, `Field`, `Input`, `Textarea`, `Select`, `Switch`, `Badge`, `Empty`, `Skeleton`, `Progress`, and `sonner`.

Before implementation, inspect current shadcn docs and add only the missing components actually used. Expected additions:

- `sheet`
- `scroll-area`
- `dropdown-menu`
- `tooltip`
- `popover` and `command` for searchable equipment or connector selection
- `input-group` if a unit suffix is embedded beside length inputs

Do not add a resizable-panel dependency in the first slice. Fixed, breakpoint-aware side panels are lower risk; panel resizing can follow after the core graph works.

### Test tooling

- Add Vitest only if no existing test runner has appeared when implementation begins.
- Keep pure setup-domain tests independent of the browser and Firebase.
- Do not introduce a large end-to-end framework solely for this feature; use the local demo store plus browser smoke testing for the integrated editor.

## 5. Code Organization

Keep setup-designer logic out of the already-large `src/lib/firestore.ts` and `src/lib/domain.ts` files.

### Domain and data access

```text
src/lib/setup-designer/
  domain.ts                 persisted and view-model types
  catalog.ts                built-in connector and signal defaults
  compatibility.ts          direction, gender, connector, signal validation
  ports.ts                  stable IDs, bulk count changes, connected-port impact
  serialization.ts          normalize, validate, size, and migrate graph snapshots
  parts-list.ts             detailed rows and grouped summaries
  repository.ts             Firestore and Storage operations
  demo-store.ts             localStorage-backed no-Firebase development data
  sample-data.ts            representative mic, DI, stage box, and mixer setup
```

### State and hooks

```text
src/hooks/setup-designer/
  use-setup-workspace.ts     load, reducer, dirty state, save, recovery, conflict flow
  use-setup-shortcuts.ts     Save, delete, escape, and fit-view shortcuts
```

### Routes

```text
src/app/setups/
  page.tsx                   setup library entry
  equipment/page.tsx         equipment-template library entry
  [setupId]/page.tsx         editor entry with setup ID
```

### Components

```text
src/components/setup-designer/
  setup-index-client.tsx
  equipment-index-client.tsx
  setup-workspace-client.tsx
  setup-toolbar.tsx
  equipment-library.tsx
  equipment-node.tsx
  equipment-node-dialog.tsx
  equipment-template-dialog.tsx
  port-editor.tsx
  signal-cable-edge.tsx
  cable-inspector.tsx
  parts-list-panel.tsx
  setup-save-status.tsx
  setup-error-state.tsx
```

Small pure render helpers may be combined during implementation, but domain rules and persistence must not move into React components.

### Existing files to extend

- `src/components/app-shell.tsx`: add an explicit workspace-width variant without changing default pages.
- `src/components/section-tabs.tsx`: add the admin-only `Setups` tab.
- `src/app/globals.css`: add scoped React Flow theme variables, handle geometry, edge animation, selected/warning states, and reduced-motion rules.
- `firestore.rules`: add admin-only setup, graph, template, connector, and inventory matches.
- `storage.rules`: add admin-only setup image rules with MIME and 10 MiB validation.
- `PRD.md`: keep schema or scope changes synchronized during implementation.

## 6. Domain Rules to Implement First

Write these as pure functions before building the canvas:

### Port identity and count changes

- Port IDs are UUIDs and never derive from a number or label.
- Increasing an input/output count retains every existing port and appends new sequential ports.
- Reducing a count returns both the next port array and a list of connected edges that would be removed.
- Reordering changes display numbers/order but not IDs.
- Node geometry derives from the larger of input and output counts. All handles stay mounted; none are hidden with `display: none`.

For high-port-count devices such as an X32 or stage box, use a compact fixed port pitch and let the node become tall on the zoomable canvas. Do not put handles in an internally scrolling node because edge geometry would become misleading.

### Connector mating

- Output equipment port connects to cable end A; cable end B connects to input equipment port.
- Connector type must match the attached equipment port unless an exception is present.
- Gender normally inverts: male equipment port mates with female cable end and vice versa.
- `none` represents genderless or explicitly unspecified interfaces.
- Cable ends may differ from each other, so adapter cables are valid.
- A port with an existing edge rejects another edge.
- Optional signal compatibility returns `valid`, `warning`, or `invalid`; physical direction and occupied-port rules remain invalid rather than warnings.

### Parts list derivation

- Resolve node names and exact source/target ports from each edge.
- Produce one detailed row per physical cable edge.
- Normalize end order only for grouping and inventory matching.
- Group by normalized ends, cable specification, and displayed length.
- Retain source-to-target order in route text.
- Missing nodes or ports produce a visible unresolved row instead of silently dropping the cable.

### Serialization

- Persist only stable node, edge, data, position, and viewport fields.
- Strip selection, dragging, measured dimensions, hover state, and component-only flags.
- Include `schemaVersion` and a migration entry point from the first release.
- Validate IDs, handle references, finite positions, colors, lengths, and enum-like values on load.
- Calculate UTF-8 byte size and warn at 750 KiB before Firestore's 1 MiB limit.
- A serialize/deserialize round trip must preserve all user-authored fields and cable-to-port references.

## 7. Repository and Firebase Plan

### Repository API

Expose a small task-oriented API from `repository.ts`:

```ts
listSetups()
createSetup(input)
getSetupWorkspace(setupId)
saveSetupWorkspace(input, expectedRevision)
duplicateSetup(setupId)
renameSetup(setupId, input)
archiveSetup(setupId)

listEquipmentTemplates()
createEquipmentTemplate(input, image?)
updateEquipmentTemplate(template, input, replacementImage?)
archiveEquipmentTemplate(templateId)

listConnectorTypes()
ensureDefaultConnectorTypes()

listCableInventory()
createCableInventoryItem(input)
updateCableInventoryItem(itemId, input)
archiveCableInventoryItem(itemId)
```

The initial UI can postpone inventory CRUD until Phase 5, but the domain names should remain reserved and consistent.

### Create and duplicate

- Allocate the Firestore setup ID before writing.
- Create `setups/{id}` and `setups/{id}/graphs/current` in one batch.
- Duplicate by reading the source metadata and saved graph, allocating a new ID, and batch-writing the independent copy.
- Reuse image references. Never copy Storage bytes.
- Duplicate only the last saved graph. If the source editor is dirty, ask the administrator to save first or explicitly duplicate the saved version.

### Save and revision conflict

Use a Firestore transaction:

1. Read `setups/{id}`.
2. Compare its `revision` with the editor's `expectedRevision`.
3. If they differ, return a typed conflict error without writing.
4. Update metadata counts, `updatedBy`, timestamps, and `revision + 1`.
5. Replace `graphs/current` with the normalized snapshot and matching revision.

The conflict UI offers:

- `Reload latest`, after confirming loss of the local draft.
- `Save as duplicate`, preserving the local draft under a new setup.
- `Download recovery JSON`.

There is no graph merge in the MVP.

### Local demo and recovery

- Follow the existing `?demo=1` and missing-Firebase behavior.
- Seed a useful sample: Vocal 3 microphone → stage box → mixer, plus guitar and bass DIs.
- Store demo setups in a new versioned localStorage namespace.
- Store recovery drafts separately by setup ID and base revision.
- On load, offer recovery only when the draft matches the saved base revision. A stale draft can be downloaded or discarded.

### Image upload

- Validate JPEG, PNG, or WebP and 10 MiB before upload.
- Create the template ID before constructing the immutable Storage path.
- Upload with progress using `uploadBytesResumable`.
- Write image metadata to the template only after obtaining its download URL.
- Replacing an image creates a new Storage object. Do not delete an older image because saved setup snapshots may still reference it.

### Security rules

Firestore admin-only matches:

```text
/setups/{setupId}
/setups/{setupId}/graphs/{graphId}
/equipmentTemplates/{templateId}
/connectorTypes/{connectorTypeId}
/cableInventory/{inventoryItemId}
```

Storage admin-only match:

```text
/setup-designer/equipment/{templateId}/{fileName}
```

All reads and writes use `isAdmin()`. Storage create/update additionally checks size and supported image MIME type. No public or generic signed-in access is added.

## 8. React Flow Integration

### Controlled graph

- Register `nodeTypes` and `edgeTypes` outside component render.
- Store nodes and edges in a workspace reducer.
- Apply React Flow `NodeChange` and `EdgeChange` events through their official utility functions.
- Mark the workspace dirty for user-authored graph changes, but not for selection-only changes.
- Track viewport changes and mark dirty only after movement ends.

### Equipment node

- Render a compact header with image or category placeholder and equipment name.
- Render inputs on the left, outputs on the right, with one fixed-pitch row per port.
- Derive visible text from the two node toggles: number, label, both, or a compact accessible fallback.
- Give every handle an ID equal to the stable port ID and an ARIA label containing node, direction, number, label, connector, and gender.
- Double-click and keyboard `Enter` open the equipment-node Dialog.
- After port changes, call `useUpdateNodeInternals(nodeId)` before closing or on the next layout frame.

### Cable edge

- Implement `SignalCableEdge` using `BaseEdge` and `getSmoothStepPath`.
- Render a neutral casing under the colored stroke so user-selected light colors remain visible on the canvas.
- Render a matching arrow marker at the target.
- Animate source-to-target flow without animating layout properties.
- Stop continuous animation under `prefers-reduced-motion`.
- Show exception state with an icon/label treatment in addition to color.
- Maintain a generous invisible interaction width for selecting cables.
- Support target reconnection and rerun compatibility/capacity checks before commit.

### Connection lifecycle

1. `isValidConnection` performs fast direction and occupied-port checks.
2. `onConnect` resolves both ports and creates a draft cable with inferred mating ends and a palette color.
3. Open the cable inspector with the new draft selected.
4. Commit the edge when required fields are valid; cancel removes the uncommitted edge.
5. Parts-list selectors derive immediately from the current edge array.

### Workspace state shape

```ts
{
  setup: SetupMetadata;
  nodes: SetupNode[];
  edges: CableEdge[];
  viewport: Viewport;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  baseRevision: number;
  dirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error" | "conflict";
  recoveryState: "none" | "available" | "restored";
}
```

Selection stays outside the persisted node and edge objects even if React Flow temporarily mirrors selection flags internally.

## 9. UI Details by Surface

### Setup library

- Page heading, short utility description, `New setup` primary action, and equipment-library link.
- Compact list rows rather than an identical card grid.
- Each row shows name, description excerpt, node/cable counts, and last update.
- Row actions: Open, Duplicate, Rename, Archive.
- Use Skeleton rows while loading and the installed Empty component for first use or errors.

### Equipment-template library

- Searchable compact rows with thumbnail, name, manufacturer/model, input/output counts, and status.
- `New equipment` action opens a Dialog.
- The Dialog accepts a public product URL and can use the server-only OpenRouter integration to research and prefill identity, description, observed price, exact mixed ports, provenance, warnings, and reference-photo candidates for administrator review.
- Template form uses FieldGroup/Field, separate Inputs and Outputs tabs, bulk counts, and a compact port table.
- Image upload has preview, progress, replace action, validation, and retry.
- Archive is confirmed and never removes existing setup instances.

### Setup toolbar

- Back to setups, editable setup name, save status, Save, fit view, grid toggle, and overflow menu.
- The primary Save action is always in the same location.
- Disable Save only when clean, already saving, or graph validation has blocking errors.
- Keyboard shortcut: Cmd/Ctrl+S. Prevent the browser Save dialog while the editor is active.

### Parts list

- `Runs` tab for route-level requirements and `Summary` tab for grouped packing counts.
- Filters for fulfillment and validation state only after the basic list works.
- Each detailed row selects and centers its edge.
- Unplanned length or fulfillment remains explicit, never represented as a blank that looks complete.
- Owned, Rent, Buy, exception, and shortage states include text/icons and not only color.

## 10. Milestone Sequence

### Milestone 0: Baseline and dependencies

- Record a clean baseline of `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` without modifying unrelated failures.
- Install React Flow and the selected missing shadcn components.
- Add a `workspace` variant to `AppShell` and the admin-only Setups navigation entry.
- Add route placeholders gated by `useAdmin`.

Exit gate: routes load only for an admin, normal pages retain their current width and styling, and baseline checks have not regressed.

### Milestone 1: Pure domain core

- Add all setup types, catalogs, port helpers, compatibility validation, serializer, and parts-list derivation.
- Add representative sample data.
- Add focused unit tests for pure rules.

Exit gate: domain tests cover stable port IDs, occupied ports, connector gender, adapter cables, exception reasons, parts-list grouping, unresolved references, and serialization round trips.

### Milestone 2: Firebase repository and setup library

- Add demo-store parity first, then Firestore repository functions.
- Add admin-only Firestore and Storage rules.
- Build setup list/create/rename/duplicate/archive.
- Build equipment-template list/create/edit/archive and image upload.
- Seed the default connector catalog safely.

Exit gate: setup and template lifecycle works in demo mode and Firebase; duplication reuses image references and archived templates remain readable from old nodes.

### Milestone 3: Canvas and equipment editing

- Build the workspace shell, controlled React Flow, equipment palette, custom node, port Dialog, and viewport persistence.
- Support node add, select, move, delete, and connected-port impact confirmation.
- Handle large port counts without scrollable node internals.

Exit gate: a Behringer X32, stage box, microphone, guitar DI, and bass DI can be placed and edited; save/reload retains exact ports and positions.

### Milestone 4: Cables and live parts list

- Build connection validation, inferred cable ends, custom animated edge, reconnection, cable inspector, exception flow, and deletion.
- Build detailed and grouped parts-list views linked to edges.
- Add fulfillment and length editing.

Exit gate: the example microphone → stage box → mixer flow produces correct cable runs and grouped counts, including adapter-cable and invalid-connection cases.

### Milestone 5: Persistence hardening

- Add normalized explicit Save, local recovery, 750 KiB warning, revision conflicts, duplicate-local-draft path, and recovery JSON download.
- Add route-leave warning and save-status feedback.
- Verify network/upload/save failure behavior.

Exit gate: refresh recovery and two-tab conflict scenarios cannot lose or silently overwrite a valid graph.

### Milestone 6: Accessibility, responsive QA, and inventory

- Complete keyboard paths, handle/edge labels, focus behavior, reduced motion, phone layout, and touch targets.
- Implement quantity-based inventory CRUD and shortest-sufficient-length matching.
- Allocate current-setup requirements by processing longest required runs first, then choosing the shortest sufficient owned cable, so short runs do not consume long cables prematurely.
- Add shortage summaries and manual override states.
- Add print/CSV only if the required acceptance criteria are already stable.

Exit gate: all PRD acceptance criteria pass, inventory shortages are correct, and the editor remains usable with keyboard, reduced motion, and small-screen parts-list workflows.

## 11. Verification Matrix

### Automated on every milestone

```text
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Add and run the setup-domain unit-test command once the test runner is introduced.

### Rules and persistence

- Admin can read/write every new Firestore collection and setup image path.
- Signed-out and non-admin users cannot read setup metadata, graphs, templates, connector types, inventory, or images.
- Oversized or unsupported image uploads fail at both client validation and Storage rules.
- Save updates metadata and graph to the same revision.
- A stale expected revision never partially writes.
- Serialized graph warning appears before the hard limit.

### Representative graph fixtures

1. Vocal microphone: one XLR-male output to a stage-box XLR-female input using an XLR-female → XLR-male cable.
2. Guitar and bass DIs: instrument input plus balanced XLR output paths.
3. Stage box to mixer: one RJ45/AES50 physical cable carrying multiple channels.
4. Adapter cable: XLR to 1/4-inch TRS with distinct ends.
5. Invalid second cable on an occupied input.
6. Saved compatibility exception with reason.
7. High-port-count mixer and stage box to verify node geometry and handle restoration.

### Manual browser QA

- Create, rename, duplicate, archive, and reopen setups.
- Create and reuse equipment images.
- Add, move, edit, connect, reconnect, and delete nodes and cables.
- Confirm parts rows always match edges.
- Refresh with unsaved changes and recover the draft.
- Create a two-tab revision conflict and save as duplicate.
- Test keyboard-only node/cable editing.
- Enable reduced motion and confirm direction remains clear.
- Test wide desktop, tablet, and phone breakpoints.
- Verify existing Songs, Members, Assignments, admin, mixer, and lyric-alignment routes remain unchanged.

## 12. Risk Register

| Risk | Mitigation |
| --- | --- |
| Large equipment creates unwieldy nodes | Fixed compact port pitch, canvas zoom, no internal port scrolling, representative X32 fixture early. |
| Dynamic handles leave edges attached to stale geometry | Stable IDs plus `useUpdateNodeInternals` after every port-layout change. |
| User-selected cable colors disappear on the canvas | Neutral casing stroke, minimum contrast check, arrow and labels independent of color. |
| Graph saves exceed Firestore limits | Normalized DTO, size measurement, 750 KiB warning, schema migration path to subcollections. |
| Template edits break old diagrams | Snapshot node data and preserve referenced historical images. |
| Two admins overwrite each other | Transactional revision check, reload/save-as-duplicate conflict flow. |
| Parts list diverges from canvas | Derive rows from in-memory edges; never maintain a second editable list. |
| Inventory matching allocates lengths poorly | Normalize units, process longest needs first, choose shortest sufficient owned item. |
| New full-width shell affects existing pages | Opt-in AppShell variant and regression checks on all current route families. |

## 13. First Implementation Slice

The first code slice should stop after Milestone 1 plus route placeholders. Its reviewable output is:

1. React Flow and required shadcn dependencies installed.
2. Admin-only `/setups`, `/setups/equipment`, and `/setups/[setupId]` placeholder routes.
3. Opt-in workspace shell and Setups navigation.
4. Complete setup-domain types and built-in catalogs.
5. Tested port helpers, compatibility rules, parts-list derivation, and graph serializer.
6. Representative sample setup data.

This slice establishes the contracts every later UI and Firebase change depends on while remaining small enough to verify without debugging persistence and canvas behavior at the same time.
