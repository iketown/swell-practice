# Fictional trio — format example

This is an original teaching example, not The Swell’s requirements. Revision: 2026-09-29. All technical selections remain proposed. Geometry is illustrative.

```text
                         UPSTAGE / BACK
STAGE RIGHT                                             STAGE LEFT
(audience left)                                         (audience right)
                    Morgan: percussion / M2
                    stereo IEM / P2
                                           Taylor: keys + vocal
                                           stereo DI / P1 / M1
      Alex: acoustic + vocal
      DI / M1
                        DOWNSTAGE / FRONT
                             AUDIENCE
```

The SVG shows dimensions and placements from the JSON. This ASCII map preserves relative grouping, not measured scale. Numbered badges in the SVG reference the equipment key, not input channels.

## Inputs

| Ch | Source | Node | Mic / DI | Stand | Phantom | Supplier |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Acoustic pickup | acoustic-di | Compatible DI; model unresolved | none | unknown | venue |
| 2 | Alex vocal | lead-mic | SM58-class dynamic | tall boom | not-required | venue |
| 3 | Keys L | keys-di | Passive stereo DI, left channel | none | not-required | venue |
| 4 | Keys R | keys-di | Passive stereo DI, right channel | none | not-required | venue |
| 5 | Taylor vocal | keys-mic | SM58-class dynamic | tall boom | not-required | venue |
| 6 | Cajon | perc-mic | Suitable dynamic instrument mic | short boom | not-required | venue |

Keys L/R occupy two channels. Inputs in this example are routed to FOH and monitors. Exact connection: balanced XLR to house console. No click or private talkback is specified.

## Monitors

| Mix | Type / mode | Recipients | Output feeds | Devices |
| --- | --- | --- | --- | --- |
| M1 | wedge / mono | lead, keys | Aux 1 | wedge-lead, wedge-keys |
| M2 | iem / stereo | perc | Aux 2 L, Aux 3 R | iem-perc |

Two monitor mixes use three output feeds. M1 serves two physical wedges. House supplies M1 wedges and all three feeds; band supplies M2 wired IEM pack and ears.

## Power

| ID | Location | Supply proposed | Outlets | Load | Circuit |
| --- | --- | --- | --- | --- | --- |
| P1 | power-keys | 120 V / 60 Hz | 2 | unknown | Unresolved; no dedicated circuit assumed |
| P2 | power-perc | 120 V / 60 Hz | 1 | unknown | Unresolved; no dedicated circuit assumed |

Power is proposed venue-supplied; the grounded US connector and exact adapter requirements need confirmation. Outlet counts do not establish independent circuits.

## Unresolved

- Confirm usable stage and physical operating footprints.

- Confirm acoustic DI and phantom needs.

- Confirm all power loads, outlets, and supplier commitments.

## Editable sources

See `example-stage.json` and `example-stage.svg`. No PDF is supplied for this fictional exercise; the downloaded PDFs in this folder are real-world format references.
