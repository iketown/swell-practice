# Swell ↔ Blender

The add-on connects a saved Swell setup to independently movable Blender items. Position, heading, elevation, tilt, and placement dimensions can move in both directions. Gear-definition corrections are explicit.

## Start or reconnect

1. Run the Swell app and open the setup. Sign in as an administrator.
2. Expand **Blender connection**, choose whether to allow gear-dimension corrections, then **Create connection → Copy connection**.
3. In Blender, open the right sidebar (`N`) and select **Swell**. Under **Setup Sync**, select the matching stage mesh. Under **Equipment sync**, click **Paste connection → Pull from website**.
4. To sync automatically, enable **Auto Sync** in Blender and **Automatically save website edits** on the setup page. Otherwise use website **Save**, Blender **Pull from website**, and **Review & push changes**.

Connections last eight hours and are held only in memory in Blender. Reconnect after reopening the file, restarting Blender, or an expired connection. Keep the website server running; the browser must stay open for its unsaved edits to be saved automatically. Automatic mode resets to off on reconnect and reload.

The installed development add-on lives at `~/Library/Application Support/Blender/5.2/scripts/addons/swell_blender_sync/`. Source lives beside this guide. Install the provided zip through Blender Preferences → Add-ons → Install from Disk on another installation. A system Python 3 executable is required for the isolated HTTP worker.

## Arrange the stage

Select an item's measurement cage or its root in the Outliner. Move (`G`), rotate (`R`), or scale (`S`) that root. Constrain floor moves with `G`, `Shift+Z`; rotate facing with `R`, `Z`. The cage represents canonical width, depth, and height. Child meshes are visual details and independent attached gear is excluded from the parent's measurement.

Use middle-mouse orbit, the wheel to zoom, and Shift+middle-mouse to pan. Numpad `0` shows the saved overview camera. Blender View → Navigation → Walk Navigation provides a walkthrough.

Add and remove linked gear on the website, then save/pull or use Auto Sync. Renaming a Blender object is safe. Duplicating a linked root produces a duplicate-ID warning: use **Unlink selected duplicate** for an unlinked decoration, or add another real placement on the website. Deleting in Blender does not delete website gear; undo it or pull and choose **Restore website items**.

For attachments, select the microphone root, Shift-select the stand root last, then **Attach selected to active**. Both keep their own website identities. Parent movement/rotation carries the child; parent scaling does not resize it. **Detach selected** removes the relationship. Push attachment changes explicitly or with Auto Sync. Moving the child independently adjusts its relative placement. Deleting its parent on the website detaches the child at its last effective pose.

## Correct dimensions

1. Select the root and choose **Edit item dimensions**. Enter **width / depth / height in inches**, or scale/edit its measurement mesh.
2. Choose whether its 2D footprint should follow physical size. A custom footprint remains independent, for example clearance around a stand.
3. Choose **Review & push changes**. The dialog shows old and proposed dimensions. Leave **Correct selected gear definition** unchecked to change this placement only.
4. To correct the reusable product, check that option and choose **Measured** only for physically verified measurements; otherwise use **Modeled estimate**. The connection must allow definition corrections.

A definition correction updates this placement and the reusable definition in one transaction, advances the definition version, and records the old/new values and actor. New placements use the corrected definition. Other existing placements keep their snapshots. Ports, images, inventory references, and signal connections are preserved. A selected older snapshot is flagged in Blender.

Dimensions never auto-push. Rotation alone does not count as a dimension change. Measurement uses the evaluated root mesh in canonical local axes, including object scale and modifiers, excluding visual children. Reflections and sheared transforms are rejected. Keep the root origin at the bottom center. Resize the root, rather than editing only decorative child geometry.

## Conflicts and recovery

- Independent edits merge; competing values pause automatic saving and show a review in the browser or Blender. Choose which side to retain. Blender's resolution applies to the listed set; browser choices are per field.
- Blender preserves a transform/measurement recovery snapshot before explicit conflict resolution, in scene property `swell_before_resolution`.
- Failed pushes keep an immutable mutation ID for **Retry last push**. A lost acknowledgement cannot apply the same mutation twice. Pull and resolve a stale-revision conflict before sending a new push.
- Browser drafts store their base snapshot locally and reconcile against newer saves after reload. Legacy drafts without a base snapshot are retained under an `older-draft` browser-storage key and are not automatically applied over newer data.
- Stage geometry or scene unit changes invalidate calibration. Review the stage outline, then **Recalibrate stage** and review resulting positions. Current add-on calibration uses horizontal, axis-aligned bounds; arbitrary rotated reference frames are tested in the conversion library but are not exposed in the add-on.

## Initial playroom

`playroom.blend` contains five 6 ft (1.8288 m) performers and 23 gear placements. Microphones are attached to their stands. Positions and roles are provisional. Existing dimensions were retained; missing values were filled with labeled placement-only planning estimates. Generic amps/drums/performers without saved catalog definitions support placement corrections only. No existing catalog dimensions were changed to create this scene.

The original is preserved as `playroom.before-swell-sync-20260907.blend` beside the working file. An isolated verification scene is also retained in the working file; it is not part of playroom's managed collection.

## Development and verification

- Living plan: `../../blender_integration.md`; wire/calibration details: `CONTRACT.md`; product model: `../../PRD.md`.
- `pnpm test:blender-contract` (Node 22.15+) runs pure contract, transform, merge, scope, and attachment checks.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` are required application checks.
- `verify-blender-geometry.py` runs in Blender's isolated verification scene and restores the measured object.
- The opt-in integration scripts create/update explicitly named verification data. The completed fixture is now archived and its sessions revoked; do not rerun later-stage fixture scripts without preparing a fresh active fixture. They use locally configured server credentials and write connection secrets only to ignored `tmp/blender-integration/` files. Never log or commit those files. `verify-live-api.mjs` expects the documented one-box round-trip fixture before its multi-item expansion.
- `seed-playroom.mjs --run` is a one-time initializer; it refuses to modify a setup that already has placements.

Current limits: no 3D cable routing, collision detection, automatic propagation of catalog corrections, or website 3D viewer. Physical footprints are projections of the canonical bounding box, not exact silhouettes. Snake endpoints keep their separate identities; inherited whole-assembly dimensions are not treated as endpoint measurements. Correct an endpoint's placement size explicitly when needed. Browser autosave pauses on failure; re-enable after resolving it. None of these local application changes has been deployed by this work.

### Live cables (v0.3)

The equipment pull also imports connection curves and the website's route waypoints. Each curve has a circular bevel; **radius × 2 = cable diameter**. Select a cable and use **Swell → Cable routing** to see direct/routed lengths, allowance-inclusive length, or change its radius. Its material carries the website's cable color. Curves follow gear while moving, rotating and scaling, including attached gear, without clicking Sync.

For routing refinement, show viewport Extras and move `Jack · …` child empties or `Route · …` controls. These edits stay in the Blender file. An incoming website change to the same anchor or waypoint replaces that local refinement. Move these controls instead of the curve itself. Save the `.blend` to retain local work.

**Export cable measurements (CSV)** writes a current per-segment report with feet-based distances, allowances, assembly IDs and device connector labels. Check assembly grouping before making a purchase list. Saved 3D measurements and website 2D estimates are deliberately separate. Exact jacks, elevations, cable diameters and obstacles still require real-world verification.

The delivered `keyboard_stage_center.blend` contains the actual `g8qTbUz0v4xk40HzhHoD` setup. Its reference people, drum kit and furniture are explicitly unlinked; only the 28 actual website nodes synchronize. Website catalog dimensions were not changed to match approximate visual models.

## Shared cable waypoints

In Blender, select a labeled `Waypoint · …` upward-facing cone empty in the viewport or Outliner. Use `G`, then `X` or `Y` (or `Shift+Z` for the XY plane). All cables assigned to that waypoint reroute together. With a paired connection and Auto Sync enabled, completed XY moves save to the website; without Auto Sync use **Review & push changes**. Website waypoint moves arrive on the next pull/poll. Names include a short ID suffix to distinguish duplicate labels.

To choose which waypoints a cable uses, select the cable in the website STAGE view and edit its waypoint list in route order, then save. This updates Blender's cable route. Moving a waypoint does not add it to nearby cables. Cable membership/order, adding waypoints, and deleting waypoints are still managed on the website. Jack endpoint refinements and 3D route-length reports remain Blender-local.

Microphone cables automatically follow a linked stand's boom to the upright, descend alongside the pole, and join the floor route beside the base. These are stand-following local guide points, not shared website waypoints. Stand movement, rotation, and modeled rod adjustments update the route automatically. Unsupported stand geometry retains the direct-drop fallback. The 3D cable report includes the boom/pole detour; website 2D routing and cable waypoint assignments are unchanged.

Shared straight floor runs use automatic parallel lanes with ¼ inch (6.35 mm) of clearance between cable surfaces. Cable thickness is included in the spacing. Bundle order is deterministic from source XY, then cable ID, and reversed traversal is handled consistently. Offsets join through bends and reconnect to the exact endpoint descents; moving gear or waypoints recalculates lanes. This is Blender-local visualization and measured 3D routing; website waypoint coordinates and cable membership are unchanged. Isolated crossings are not treated as shared runs, and this is not an obstacle/collision solver.

Lane regression checks: `python3 tools/blender/lanes.test.py`.
