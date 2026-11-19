# The Swell live-show documents

**Current direction from Brian:** prepare distinct audio-production/house-sound and backline communications. Use the current [Blender-linked setup](http://localhost:3001/setups/g8qTbUz0v4xk40HzhHoD) as source material, with an editable Illustrator master and simple 2D PDF exports. The SVG source recommendation below is now supplemented by a native `.ai` master. His requested page was 8 × 11 inches; resolve whether standard 8.5 × 11 Letter was intended before final export if needed.

Researched September 29, 2026. Start with a short technical packet and a separate show-specific advance sheet. PDF is a common production handoff, but venues may supply their own form. MusicNSW's guidance describes the PDF rider and the exchange of venue specifications; the Red Room at Berklee explicitly requests stage plots and input lists. [MusicNSW](https://www.musicnsw.com/resources/tech-rider-stage-plot-template), [Berklee](https://www.berklee.edu/red-room-cafe-939/booking-and-rental/for-bands).

## What to prepare

The formats and lengths below are recommendations for The Swell, not a universal industry standard.

| Asset | What it communicates | Recommended format |
| --- | --- | --- |
| Stage plot | Performer names/positions, stage sides/front, instruments, numbered audio sources, monitors, power and any risers | One landscape PDF page; retain SVG and JSON |
| Input list | One console input per row: channel, source, performer/location, connection, mic/DI, stand, phantom, supplier, notes | PDF table + editable CSV; separate L/R rows for stereo |
| Monitor/output list | Mix ID, recipients, mono/stereo, wedge/IEM, feed/aux assignments and who brings the system | Table in same PDF; count speakers separately from mixes |
| Technical rider/backline | Band vs venue vs rental responsibilities, stage/riser needs, setup/changeover, crew, power and relevant lighting/playback | Short written PDF section plus equipment responsibility table |
| Show advance/day sheet | Date/venue, contacts, arrival/loading/parking, soundcheck, doors, set times, changeover, curfew, load-out | One or two pages, or venue's form; editable master |
| Promo/EPK package | Approved artist name, short bio, press photos/credits, logos and useful video/social links | Linked folder/EPK with original downloadable JPGs/PNGs, vector logo and text |
| Hospitality/access needs | Agreed practical provisions or access arrangements | Separate short document if applicable |
| Set list/cue sheet | Order/durations, breaks, instrument changes, playback and lighting cues | Printable PDF; editable master |
| Booking/payment documents | Deal terms and any requested vendor/payment paperwork | Keep with the relevant booking/finance contact, separate from production download |

For the first usable audio packet, make pages 1-3 the audio stage plot, input/monitor lists, and audio technical notes. Prepare a separate backline equipment request and placement plot for that supplier. Add pages only if they improve readability. Keep a show-specific day sheet outside these reusable documents. The MusicNSW worksheet explains the value of centralizing event-day logistics; Molly Tuttle's production site demonstrates separate downloadable document categories and configurations. [Worksheet guidance](https://www.musicnsw.com/resources/worksheet-template), [production download example](https://mollytuttleadvance.com/downloads).

## Formatting decisions

- Default to US Letter landscape for the plot; use A4 when appropriate to the recipient. Use normal page sizes and roughly 10-12 point type. Check an actual-size print preview and grayscale output. These are design recommendations.
- Put **The Swell**, lineup/configuration, revision date, document status and production contact on every page. Use one confirmed version for each show.
- Suggested filenames: `The-Swell_Tech_5piece_YYYY-MM-DD_v01.pdf` and `The-Swell_Advance_Venue_YYYY-MM-DD_v01.pdf`.
- Label **AUDIENCE** at the bottom. Stage right goes on page left; stage left on page right. Show stage dimensions only if measured/agreed; otherwise mark the layout illustrative.
- Keep channel IDs and monitor IDs visually distinct. Include a legend. Put detail in the tables instead of piling notes on top of the stage symbols.
- Keep editable SVG/JSON/CSV locally; PDF is the promoter/crew-facing snapshot. Venue-specific templates take priority over these defaults.

## Advancing the show

Request the venue's current tech spec and advance form. Compare the actual console inputs, monitor outputs, supplied backline, microphones, stands, power locations and usable stage footprint with our needs. Resolve substitutions and supplier responsibilities explicitly. Then confirm the schedule and final revision with the production contact. As one concrete example, Berklee asks artists to begin this process 2-3 weeks ahead; use each actual promoter's deadline rather than assuming that interval everywhere. [Berklee advance guidance](https://www.berklee.edu/red-room-cafe-939/booking-and-rental/for-bands).

## What is already known about The Swell

The saved formation is a W: audience-left to right **Joe, Cron, Sam, Ike, Jackson**, with Joe/Sam/Jackson behind Cron/Ike. Their reference instruments are guitar, keys, drums, bass, guitar. This establishes a useful first spatial draft, but does not establish the production patch or power requirements. See [The Swell intake](THE-SWELL-INTAKE.md).

Microphone and DI decisions will follow the actual signal chain. An SM57-class dynamic is a reasonable guitar-cabinet proposal; an acoustic with a pickup may use a DI chosen for its pickup/preamp, while an acoustic with no pickup needs a microphone. [Shure SM57 guide](https://www.shure.com/en-US/docs/guide/SM57), [Radial acoustic DI guide](https://www.radialeng.com/blog/acoustic-pickups-how-to-make-them-sound-their-best).

## Local deliverables

- [Downloaded examples and notes](examples/INDEX.md): four original PDFs, source links and provenance.
- [The Swell intake](THE-SWELL-INTAKE.md): known formation and questions needed to finish the real packet.
- [Installed stage-plot skill](/Users/brianeichenberger/.codex/skills/stage-plot/SKILL.md): reusable instructions, audio/layout rules, machine-readable schema, fictional JSON example and consistency checker. Invoke as `$stage-plot` (hyphenated skill identifier for the requested stage_plot workflow).

Research and references are complete. A real, advance-ready Swell rider still needs the band-specific technical answers in the intake.
