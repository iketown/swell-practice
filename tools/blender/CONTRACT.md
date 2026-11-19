# Swell equipment sync contract v1

Defined 2026-09-07 as Step 1 of `../../blender_integration.md`.

## Implementation boundary

Implemented: Zod wire schemas in `src/lib/setup-designer/blender-contract.ts`, pure coordinate conversions in `blender-coordinates.ts`, optional `EquipmentNodeData.stage3d` persistence, and focused tests. Run `pnpm test:blender-contract` with Node 22.15 or newer.

Implemented in Steps 2–5: equipment API, setup-scoped sessions, atomic mutations/receipts, browser draft reconciliation, Blender controls, procedural proxies, rigid attachments, and opt-in autosync. Add-on v0.2.0 is installed and the playroom contains 28 linked placements. See `README.md` for operation and current limitations.

## Calibration of playroom

Connected application: Blender 5.2.0 LTS, metric units, `scale_length = 1`. The installed Swell add-on is v0.2.0 and its source matches the repository copy. It is linked to setup `QWSok55nO20JC3B8WL0x` and mesh `stage`.

The stage is a planar trapezoid at Z = 0 with identity world matrix. World bounds, including floating-point noise, are X = [-3.9623999596, 3.9623999596], Y = [-0.0000001732, 3.6576006413]. Its backstage corners are approximately X = ±3.055235 at Y = 3.6576; its audience corners are X = ±3.9624 at Y = 0. The existing bridge maps `x = worldX - minX`, `y = maxY - worldY`.

Use the following idealized reference fixture in tests (meters); during pairing capture actual evaluated mesh bounds and keep the resulting calibration in the `.blend`:

```json
{
  "schemaVersion": 1,
  "setupId": "QWSok55nO20JC3B8WL0x",
  "stageObjectName": "stage",
  "originWorldMeters": { "x": -3.9624, "y": 3.6576, "z": 0 },
  "frameYawDegrees": 0,
  "metersPerBlenderUnit": 1
}
```

The origin is the top-left **bounds** corner, not necessarily a vertex of the floor polygon. Positive bridge X goes right on the website; positive bridge Y goes toward the audience; positive elevation goes upward. Do not reinterpret theatrical stage-left terminology as a coordinate sign change.

Initially require a horizontal stage. The conversion library supports translated/yaw-rotated reference frames; the current add-on exposes horizontal axis-aligned calibration only. changing the mesh or unit scale invalidates calibration until explicitly reconciled. Do not recompute the origin automatically on each pull. Persist an evaluated stage geometry signature beside the frame in the add-on, and compare it and the server stage dimensions/outline before a push. A materially changed frame or stage requires recalibration and review of existing placements.

### Conversion and anchors

Let `f = 0.3048`, website position be `(xFeet, yFeet)`, and unrotated footprint be `(wFeet, dFeet)`:

```text
centerXMeters = (xFeet + wFeet / 2) * f
centerYMeters = (yFeet + dFeet / 2) * f
XworldMeters = originX + cos(frameYaw)*centerX + sin(frameYaw)*centerY
YworldMeters = originY + sin(frameYaw)*centerX - cos(frameYaw)*centerY
ZworldMeters = originZ + elevationMeters
Blender location = worldMeters / metersPerBlenderUnit
Blender XYZ Euler = (roll, pitch, frameYaw - heading), converted to radians
```

The placement root has its origin at the center of the unrotated floor footprint, at the item's support plane. A floor-standing upright box is modeled from local Z = 0 to height; its center is not used as the placement elevation. At heading zero, model +X runs right on the plot, model +Y points backstage, and model +Z points up. Orient imported visual models under the root to match these axes.

Use XYZ Euler decomposition consistently: `Rz(frameYaw - heading) * Ry(pitch) * Rx(roll)`. Prefer the stored heading and tilt decomposition when equivalent Euler representations exist, especially near gimbal lock; decomposition changes must not be mistaken for geometry resizing. Arbitrary object rotation modes are read through the world matrix, not by assuming `rotation_euler` describes the world transform. Negative scale and shear need explicit normalization/review before writes.

Golden example: a 2 × 1 ft footprint at website X = 2 ft, Y = 3 ft has center `(0.9144, 1.0668)` meters and Blender location `(-3.048, 2.5908, 0)`. Heading 90° becomes Blender Z rotation -90° without moving the root. Correcting the footprint to 3 × 1.5 ft keeps that center fixed and changes website X/Y to `(1.5, 2.75)` ft. At 37°, location still stays fixed and Z rotation becomes -37°.

Off-stage coordinates are valid contract values. Imported data must not snap or clamp. `stagePositionForNode` now retains explicit persisted X/Y and positive footprints below one inch, while seeding and deliberate browser interactions keep their separate constraints. Polygon containment is a separate warning, not an implicit mutation.

## Persistence and dimensions

The existing graph schema remains version 2. `node.stagePosition` continues to store 2D X/Y, footprint, heading, and port anchors. `node.data.physicalDimensions` remains the instance's inch-based physical size snapshot. Optional `node.data.stage3d` stores:

```json
{
  "schemaVersion": 1,
  "elevationFeet": 0,
  "pitchDegrees": 0,
  "rollDegrees": 0,
  "footprintMode": "custom"
}
```

Absent `stage3d` means elevation/pitch/roll zero and a custom footprint preserving the legacy layout. No eager migration or database backfill is needed. The normalizer retains valid `stage3d`; malformed optional state is discarded on load so legacy graph loading still succeeds. API writes must instead reject invalid input before persistence.

- `physical` footprint: derive an unheaded top-down bounding footprint from the canonical bounding box in its pitch/roll configuration, before applying heading. Recompute when its physical dimensions or tilt change. Simple upright boxes use physical width/depth.
- `custom` footprint: keep its separately chosen operating footprint. Physical dimension corrections leave it unchanged unless the request also supplies a footprint edit.
- Center remains fixed in either mode when footprint size changes. Port anchor side/offset is preserved; derived cable lengths are recalculated.
- Heights can be missing on reads. Never fill a catalog field with a guessed proxy height. The add-on can draw an estimated proxy but must identify that fact.

For geometry-based corrections, measure only designated measurement geometry in the canonical model frame. Evaluate modifiers and root/world scale, and remove the root's rigid world pose before measuring. Do not measure the world-aligned bounds. Exclude text, clearance guides, and attached independent items. Treat nonuniform parent transformations that introduce shear as unsupported until normalized. Visual resizing, dimension controls, and model axis adapters must share one measurement convention; This was verified against evaluated geometry, nonuniform scale, applied scale, tilt, and modifiers in Blender 5.2.

Both correction scopes require all three positive finite dimensions and `measurementKind` (`measured` or `modeled-estimate`). A partial catalog record can be read but cannot accidentally become a three-axis correction without completing the review.

- `placement`: replace only width/depth/height on the node's size snapshot, retaining weight, source text, and other metadata. Record a correction receipt for that node. Do not change `templateVersion`.
- `definition`: require the referenced definition ID and its **current** expected version, verified against the node reference. Atomically update only definition dimension fields, its version, current node dimension snapshot, setup revision, and audit/receipt records. Keep other instances unchanged. Keep the node's general `templateVersion` unchanged because ports/photos and other fields were not refreshed; record the dimension-specific definition version in the correction audit. New instances inherit the new definition dimensions normally.

Reusable-definition edits, media updates, and archive operations now use expected-version transactions, preventing stale browser objects from overwriting corrections.

## Identity mapping

- An ordinary device maps to exactly one root identified by setup ID and node ID.
- A transport endpoint maps to its node ID and carries `assemblyId`/`transportEndpointId`. A snake's box and fan ends are distinct physical placements connected by one assembly, not duplicate complete snakes. Render endpoint proxies; do not apply whole-assembly catalog dimensions to each endpoint. Initially disable definition correction on endpoint/cable proxies lacking a canonical whole-product measurement model.
- A cable-assembly node maps to its own identity but does not generate duplicate gear for each channel. Cable paths are later work.
- Performers use ordinary STAGE-only equipment nodes with category `performer`, no ports, and a six-foot model. The initial generic performers have placement-only dimensions and no member assignment. No separate performer collection is needed.
- The API validates every node and definition association. Client-supplied IDs do not authorize access. Object names are display labels only.

## API operations

Use `/api/setups/{setupId}/blender-items` for the equipment protocol, keeping the existing `/blender-sync` stage-outline POST compatible.

| Operation | Request | Result |
| --- | --- | --- |
| GET | Setup-scoped credential | `BlenderSnapshotSchema` with committed revision, physical stage outline, and items |
| PATCH | `BlenderPatchSchema` | `BlenderAcknowledgementSchema` |

Read metadata and graph at a consistent revision. Disable response caching. Include per-instance snapshot version and current reusable definition version separately; a current definition version does not imply the instance snapshot has been refreshed.

Patch example, IDs illustrative:

```json
{
  "schemaVersion": 1,
  "setupId": "QWSok55nO20JC3B8WL0x",
  "baseRevision": 4,
  "mutationId": "7a3bb9dc-2557-4f14-a7f4-106ca85d2c02",
  "clientId": "433911d6-0d87-4a1b-a4a0-9eefb1808064",
  "changes": [{
    "nodeId": "example-di",
    "pose": { "centerXMeters": 0.9144, "centerYMeters": 1.0668 },
    "dimensions": {
      "scope": "definition",
      "templateId": "example-definition",
      "expectedDefinitionVersion": 3,
      "measurementKind": "measured",
      "values": { "widthMeters": 0.1524, "depthMeters": 0.1016, "heightMeters": 0.0508 }
    }
  }]
}
```

Only specified pose fields change; omitted fields are preserved. No whole graph, ports, connections, inventory, or deletion fields are accepted. At most 100 item patches, one per node and at most one correction per definition per request. Validate URL/body setup agreement, request size (256 KiB maximum), identifiers, known nodes, definition ownership, finite values, and the graph's existing document-size limit. Calibration does not travel with every patch: the wire pose is stage-relative, never an arbitrary Blender world position.

### Transaction, conflicts, and replay

One transaction reads setup metadata/graph, any corrected definitions, and the mutation receipt before writing anything. Require the setup base revision and each corrected definition version to match. All requested changes either commit together or none do.

Write `setups/{setupId}/blenderMutations/{mutationId}` with a canonical validated-payload hash, actor, client ID, committed acknowledgement, and timestamp. A retry with the same actor/client/payload returns the original acknowledgement without a second write, even if the setup revision has since advanced. Same ID with different data is a conflict. A replayed acknowledgement does not authorize rolling the browser or Blender baseline backward; fetch the current snapshot before reconciling.

The receipt also records per-node old/new dimensions, scope, measurement kind, and corrected definition version. Definition corrections additionally record an immutable entry under `equipmentTemplates/{templateId}/dimensionCorrections/{mutationId}` so their history remains available independently of a setup. Server computes actor/time/old values; the client cannot supply them. Initially retain mutation receipts without automatic expiry so replay behavior is not weakened by a TTL. Keep these server-managed records inaccessible to direct client writes.

Errors use `{ error: { code, message, currentRevision?, currentDefinitionVersions? } }`:

- 400: malformed or unsupported protocol/fields.
- 401/403: absent/expired credential or missing permission.
- 404: setup or placement no longer exists.
- 409: stale setup/definition, mismatched mutation replay, or incompatible mapping.
- 413: request or resulting graph too large.

Conflict behavior retains pending changes and shows local versus latest values. Independent fields merge using the retained baseline; competing fields require explicit selection. Safe retry requires a new preview against a refreshed baseline and a new mutation ID, except for an exact network retry.

## Authentication

Use a browser-authenticated, setup-scoped pairing session instead of extending the legacy local-header bypass to equipment writes.

1. An existing signed-in admin requests a session for this setup using their Firebase ID token. Strictly verify the token and admin status; do not accept the demo-header shortcut for this operation.
2. Create a cryptographically random session ID/secret and store only its hash plus setup ID, actor UID, permissions, expiry, and revocation state in a server-only `blenderSyncSessions` record.
3. Return the credential once to that browser for pairing with the add-on. Session permits reads and placement edits; definition corrections require the separately stated permission when issued. Default duration: eight hours; revocable at any time.
4. Every equipment request verifies the secret hash, setup match, expiry/revocation, required permission, and that the issuing actor still has access. Never rely on request hostname as proof of authorization.
5. Keep the credential in add-on session memory, not scene custom properties or `.blend` files. Reconnect after restart/expiry using a new session. Use HTTPS except loopback development; do not send credentials across redirects or arbitrary origins.

Pairing UI and permission issuance are implemented. The original stage-outline bridge remains separate and compatible; its authorization has not been migrated.

## Transport and browser integration

Use a separate worker process for HTTP I/O, exchanging bounded JSON messages through nonblocking IPC. The worker never imports `bpy`; main-thread timers apply queued updates. Stop the worker on disconnect/add-on unregister/file change and handle timeout/cancel without freezing the viewport. Manual buttons reuse this transport; opt-in auto-sync polls every three seconds while clean, debounces completed changes for one second, and backs off transient failures. Incoming scene updates wait during transforms/Edit mode.

Subscribe to committed graph updates in the browser. Clean editors can replace their baseline; dirty editors retain the local graph/recovery state and offer conflict review. Pair server metadata and graph revisions so an incoming snapshot cannot mix versions. Do not restore an old local draft automatically over a newer committed graph.

Use [Blender's threading guidance](https://docs.blender.org/api/current/info_gotchas_threading.html), [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), and [Firestore listeners](https://firebase.google.com/docs/firestore/query-data/listen) when implementing these mechanisms. Contract tests verify pure transformations, merges, attachments, correction scopes, and compatibility. Separate integration runs verified live round trips, API auth/retries, evaluated geometry, conflict UI, and a fresh background load of the saved scene.


## Attachment and measurement extensions

`stage3d.attachment` and each snapshot item may contain `{ parentNodeId, offsetMeters: {x,y,z}, rotationXYZDegrees: {x,y,z} }`. Local axes are Blender's right-handed axes. Patches accept `attachment: null` to detach. Server reconciliation carries children after parent-only changes and recomputes relative transforms for explicit child movement. Cycles reject the transaction. Blender uses a location/rotation helper parent to exclude scale inheritance.

`stage3d.dimensionOverride: true` marks explicit placement corrections. A transport endpoint or cable without this marker omits inherited product dimensions from the snapshot, avoiding a whole-assembly size on every endpoint. `dimensionsSourceText` optionally accompanies snapshot dimensions to identify estimates. Fallback geometry never produces a dimension patch just by being pulled.

## Cable snapshot extension (v0.3 add-on, schemaVersion 1)

Snapshots optionally include `cables`; old snapshots omit the field and keep saved routes. Each cable contains its edge ID, source/target node and port IDs, device connector labels, normalized stage-side anchors, port index/count, color, signal type, channel capacity, trunk flag, assembly memberships, routing waypoint positions in meters, drop/slack allowances, and the separate website length estimate. `modelHint` carries category/template context so renamed devices can still receive an appropriate proxy.

This is a read-only extension. Existing PATCH permissions and dimension review remain unchanged. Jack offsets and local route-control adjustments live in the Blender document; they are not written into the website graph. Website anchor/waypoint changes replace the affected local controls. The add-on updates beveled curve geometry from current world-space jack locations every 0.2 seconds even with network auto sync off. Saved curves remain visible without the add-on; active following requires the installed Swell add-on.

Measurements use the rounded polyline centerline plus any drop allowance beyond the modeled vertical drops, then service slack. `direct` is Euclidean jack-to-jack distance. Reported lengths are planning estimates; they do not account for obstacles unless routing controls are placed accordingly. Assembly segments retain their IDs for aggregation and must not be counted as independent purchase quantities. Device connector labels describe the equipment jacks, not necessarily cable-end genders. Website lengths retain their existing meaning; 3D length measurements are currently exported locally, not pushed back into that field.
