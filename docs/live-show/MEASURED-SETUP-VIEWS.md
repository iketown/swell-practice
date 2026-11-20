# Measured setup views

Planning brief from Brian, November 17, 2026.

Initial implementation: all three admin views share the current Plot and movement
callbacks. Stand base references, numeric placement, setback matching, and measured
stand diagrams/schedules are available. The print packet keeps the overview first
and appends stand and cable setup sheets after the equipment and input pages.
Cable sheets use channel/destination references and omit placement dimensions.
Existing positions remain approximate until their base references are set.
Complete XLR routes and length/allowance calculations remain planned until the
placements are established.

## Shared layout and measurement system

Generate Overview, Stand placement, and Cable patch and routing from one saved
version. Do not maintain three independent layouts. Preserve the current W
formation and existing input numbers, allocations, and stage-box assignments.

Use the intersection of stage centreline and the downstage playing-area edge as
the crew's measurement origin. Draw a centreline from downstage to upstage and
show its intersection with the downstage edge clearly. Display positions as:

- Distance toward stage right or stage left from centreline.
- Distance upstage from the downstage edge.

Keep audience orientation explicit: stage right is page left. Display feet and
inches, with zero as “On centreline.” Do not confuse this datum with the centre
of the rectangular stage. Use the saved stage dimensions for each version,
excluding sidestage. For the current top-left coordinate system, a physical
anchor at (x, y) has centreline offset x - width / 2 and downstage setback
depth - y. Screen spacing and zoom must not enter these calculations.

## Physical anchors and standard positions

Give each measured object a stable physical placement anchor. A microphone
stand uses its base centre; an instrument stand uses its floor-base centre.
Define keyboard and rack reference points explicitly. Symbol bounding boxes,
portrait centres, and input-number badges are not placement datums.

Keep connector anchors distinct from placement anchors. A microphone cable
begins at its connector, including the rise above the floor. Decorative artwork
scaling must not change a physical location or a cable requirement.

Start with Chris, Brian, Jackson, and Joe's vocal stands. Chris and Brian share
one downstage setback, as requested. Keep lateral offsets independently
editable; symmetry for the other stands is not yet a confirmed requirement.
Offer numeric offset and setback controls and an optional six-inch placement
grid. Selecting a shared setback moves both stand bases together; dragging one
must either preserve that constraint or explicitly detach it.

Review proposed simple feet-and-inches positions against the current draft
before treating them as production measurements. Existing approximate artwork
positions are not confirmed measurements. Preserve linked local relationships
when adjusting a station; moving a stand must not silently move an entire
performer station. Moving a complete station should be an explicit operation.

## Three views

### Overview

Retain the familiar full arrangement, instrument captions, source numbers,
stage boxes, perimeter cable guidance, and clear-area notices. Keep measurement
detail off this view by default. A light centreline can provide orientation.

### Stand placement

Emphasize stand-base markers, stand types, station names, and input references.
Use faint equipment context so a stagehand can identify each position. Dimension
each measured base to centreline and the downstage edge; avoid dimension chains
between stands. Include a matching table with stand ID, station, type, side,
centreline offset, and downstage setback. Distinguish exact planned base
locations from schematic context. Keep labels legible on Letter landscape;
use an additional table sheet when necessary.

Begin with vocal stands, then account for instrument stands, keyboard support,
and drum microphone stands/mounts as their physical references are established.
The combined Nord artwork currently includes its stand; a stands-only view
must not silently omit that support or count it twice.

### Cable patch and routing

Show endpoints, run identifiers, required connections, assigned stage boxes,
and proposed individual routes. Keep the dotted perimeter direction guide
visually distinct from actual cable runs. Retain the clear-area guidance and
enough faint equipment context to find each endpoint.

Pair the drawing with a schedule: run ID, source, destination box and input
reference, cable type/connectors, routed distance, rise/slack allowances,
selected stock length, supplier, and confirmation state. A plot input number
does not establish a physical box socket or FOH channel. Mark those separately
and leave unknown assignments unresolved.

Calculate cable requirements from saved physical routes, not rendered parallel
lane offsets or straight-line endpoint distances. Add connector rises and
explicit working slack before rounding up to configured stock lengths. Flag
missing routes, missing destinations, insufficient selected lengths, and
crossings of established clear areas. Derive stock totals from individual
physical cable allocations; avoid duplicating existing manifest entries.
Keep stage-box uplinks, monitor feeds, splits, and spares distinct from the
source-to-box input runs.

Label routing as proposed until agreed with venue audio. Keep detailed internal
wiring private by default. Allow an administrator to deliberately select a
reviewed cable setup sheet for printing without exposing all private routing
in the default public overview or changing publication implicitly.

## Editing, printing, and delivery order

1. Add physical anchors and numeric placement editing. Establish the four
   vocal stand locations and Chris/Brian's shared downstage setback.
2. Add the view selector and measured Stand placement sheet. Keep view selection
   local and all positions shared. Print selected views from the same saved
   revision, with revision/status, audience orientation, units, URL, and QR.
3. Extend the existing cable manifest and routing editor with physical
   connector anchors, source-to-box runs, route lengths, allowances, and totals.
   Add the Cable patch and routing sheet after checking coverage.
4. Verify a sample dimension by hand, stage-size changes, shared-depth editing,
   artwork resizing, screen zoom, save/reload, and older version compatibility.
   Verify source/destination mappings and cable totals against the allocations.
   Render and inspect each printed view in grayscale at actual Letter size.

Update PRD.md and stage-plot/AGENTS.md with implemented schema and behavior in
the corresponding implementation changes. Review proposed standard offsets,
clear-area boundaries, and cable allowances before marking them confirmed.

Print layout update, November 17: the overview, stand and cable diagram sheets
use a compact single-row title and the remaining page height. Print framing
removes spare editing perimeter while retaining real outlying content and
orientation labels. Stage proportions and saved positions remain unchanged.
The three diagram sheets enlarge the current Standard setup by approximately
33% compared with the former print scale; table sheets retain their margins.
