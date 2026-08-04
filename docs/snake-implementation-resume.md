# Snake implementation record

Started: 2026-08-03

Completed and verified: 2026-08-04

This record covers the setup-designer snake work and its gear-inventory integration.

## Product decision

A physical snake is one inventory asset and one parts-list requirement, but it expands into multiple movable graph endpoints:

- Regular, drop, or extension snake: Side A plus Side B.
- Split snake: Side A plus two matched Side B endpoints, normally FOH and monitors.
- Every physical connector has an `endpointId` and a stable `channelKey`.
- Ports with the same `channelKey` are internally routed together.
- A source connected to a snake input supplies the carried label for every paired output, for example `Snake ch 1 (Guitar A)`.
- The endpoint nodes share an `assemblyId`, fulfillment source, and exact inventory asset. Repeating the same asset across endpoints in the same assembly is valid; assigning it to another assembly or ordinary node is not.
- The internal trunk is a fixed, non-inventory graph edge. External patch cables remain normal cable requirements.
- The parts list shows the snake once, including channel count, snake type, length, and endpoint count.

## Implemented surface

- The equipment definition and Firestore/demo schemas support `device`, `snake`, and `split-snake` equipment kinds.
- Snake definitions store fixed length, length unit, channel count, endpoint labels/styles, and per-port endpoint/channel mappings.
- OpenRouter equipment research identifies standard, regular, drop, extension, and split snakes and returns their topology and paired port banks.
- The equipment editor can review or manually create the topology, assign banks to endpoints, and edit route keys.
- Adding a snake creates two or three movable React Flow nodes and one or two thick fixed trunk edges.
- Carried source labels appear on every matching output, including both destinations of a split snake.
- Fulfillment and physical-asset assignment are synchronized across every endpoint in one assembly.
- Duplicate-asset validation treats the complete assembly as one setup item.
- Dialog removal and keyboard deletion remove the complete assembly and its connected patch cables.
- Internal trunks are excluded from cable totals, cable requirements, cable selection, reconnection, and signal-flow animation.
- Gear usage groups every assembly into one parts-list row.
- The system overview in `/docs` and the canonical `PRD.md` describe this model.

## Verified example

Product URL:

`https://www.sweetwater.com/store/detail/SM0800FBM25--pro-co-smast-8-channel-xlr-drop-snake-25-foot`

The live research workflow identified the Pro Co SMAST as a regular 8-channel, 25-foot drop snake, generated eight XLR female inputs and eight matched XLR male outputs with `channel-1` through `channel-8`, and returned no warnings. The equipment definition was created successfully in the local demo rack.

Live editor verification confirmed:

- Two independently movable endpoint nodes.
- One fixed trunk labeled as 8 channels and 25 feet.
- One derived Gear requirement for the two-endpoint assembly.
- Manual split-snake mode exposes Side A, Side B FOH, and Side B monitors.

An executable topology check confirmed that a split snake creates three endpoints and two fixed trunks, carries `Guitar A` to channel 1 on all three endpoints, counts as one snake requirement, and leaves only the external patch as a cable requirement.

## Verification commands

- `pnpm exec tsc --noEmit`
- Focused ESLint across every setup-designer and documentation file changed for snakes.
- `pnpm build`

All checks passed on 2026-08-04.
