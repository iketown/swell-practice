# Mixer Stem Encoding Guide

Use this guide when preparing isolated stems for the multitrack player at
`/songs/[songSlug]/player`. These files are web delivery copies; keep the
original WAV or lossless masters elsewhere.

## House Standard

| Stem type | Channels | MP3 setting |
| --- | ---: | ---: |
| Individual vocal or part | True mono | 128 kbps CBR |
| Background mix | Stereo | 192 kbps CBR |

- Encode with LAME through FFmpeg.
- Use `.mp3` files and strip unnecessary metadata.
- Use one sample rate for every stem in a song.
- Keep the session's native sample rate: normally `44,100 Hz` or `48,000 Hz`.
- Do not use 256 or 320 kbps for these rehearsal files.
- If download size becomes more important than fidelity, use the alternate
  `96 kbps mono / 160 kbps stereo` preset for an entire song rather than
  changing settings stem by stem.

MP3 remains the house delivery format because it is widely supported and the
current mixer uploader accepts MP3 files. WAV and FLAC are appropriate masters
but are unnecessarily large for a browser player that must download and decode
every stem before playback.

## Synchronization Rules

These rules matter more than small encoder-quality differences:

1. Export every stem from exactly the same session start marker.
2. Export every stem through exactly the same end marker.
3. Preserve leading silence. Never trim a stem to its first audible event.
4. Leave enough common time at the end for the longest reverb or decay tail.
5. Export all stems for a song in the same batch.
6. Encode the whole batch with the same FFmpeg/LAME version and settings.
7. Do not edit, trim, or add silence to individual MP3s after conversion.

Lossy formats can add encoder padding. Encoding equal-length WAV files in one
batch with the same encoder keeps that behavior consistent across the stems.

## Channel Rules

- Deliver every isolated vocal or individual part as mono.
- Do not export a mono signal as dual-mono stereo. It approximately doubles its
  encoded and decoded size without improving the mixer.
- Keep the backing mix stereo and process it separately from the part stems.
- The Finder Quick Action downmixes a stereo part export to mono.
- Treat files with more than two channels as an export error; do not silently
  downmix them in the converter.

## Level Preparation

- Prevent clipping and leave approximately 3 dB of peak headroom.
- Do not normalize each stem independently.
- Do not change stem balances to compensate for the player. The mixer state
  volumes and song-specific overrides provide the rehearsal balance.
- Avoid adding limiting or mastering processing to isolated parts unless it is
  intentionally part of their sound.

## FFmpeg Commands

Set `-ar` to the song session's native sample rate. The examples below use
`48,000 Hz`.

### Mono stem

```bash
ffmpeg -hide_banner -i "voc_1.wav" \
  -map 0:a:0 -map_metadata -1 -vn \
  -c:a libmp3lame -b:a 128k -ar 48000 -ac 1 \
  "voc_1.mp3"
```

### Stereo stem

```bash
ffmpeg -hide_banner -i "inst.wav" \
  -map 0:a:0 -map_metadata -1 -vn \
  -c:a libmp3lame -b:a 192k -ar 48000 -ac 2 \
  "inst.mp3"
```

Use `-n` before `-i` when the converter should refuse to overwrite an existing
output. Use `-y` only when replacement is an explicit converter option.

## AppleScript Converter Requirements

The folder converter should:

1. Ask for a folder containing the source WAV or AIFF part stems.
2. Locate both `ffmpeg` and `ffprobe`. AppleScript applications do not always
   inherit the Terminal's `PATH`, so check common Homebrew locations such as
   `/opt/homebrew/bin` and `/usr/local/bin`, or store an explicitly selected
   executable path.
3. Find `.wav`, `.wave`, `.aif`, `.aiff`, and `.aifc` files
   case-insensitively without descending into the output folder.
4. Inspect each file before conversion:

   ```bash
   ffprobe -v error -select_streams a:0 \
     -show_entries stream=sample_rate,channels \
     -of csv=p=0 "input.wav"
   ```

5. Confirm that every source file in the folder uses the same sample rate.
   Stop and report the mismatched files instead of silently making mixed-rate
   outputs.
6. Use the detected batch sample rate when it is `44,100 Hz` or `48,000 Hz`.
   Ask before resampling any other rate.
7. Encode every one- or two-channel part as `128 kbps / mono`, downmixing
   stereo sources.
8. Stop and report files with zero audio streams or more than two channels.
9. Create a sibling output folder such as `web-mp3`.
10. Preserve the source basename and change only the extension to `.mp3`.
11. Quote every filesystem path. In AppleScript shell commands, use
    `quoted form of` for selected folders, input files, and output files.
12. Refuse to overwrite existing files by default.
13. Finish with a summary showing converted, skipped, and failed files.

The part converter should not infer the part type from filenames. It
deliberately outputs mono. Process the stereo backing mix separately with the
stereo command above.

## Finder Quick Action

The installed **Convert to Stem MP3** Finder Quick Action prepares selected
WAV or AIFF part files as mono web stems:

- it accepts `.wav`, `.wave`, `.aif`, `.aiff`, and `.aifc`;
- it creates each `.mp3` beside its source file;
- it keeps the source file and refuses to overwrite an existing MP3;
- it encodes every source as mono at 128 kbps, downmixing stereo inputs;
- it validates the whole selection before conversion, including the shared
  sample rate and one- or two-channel requirement; and
- it reports completion or validation failures with a macOS notification or
  alert.

Its maintained source is in
[`tools/stem-mp3-quick-action`](../tools/stem-mp3-quick-action/README.md).

## Pre-upload Check

Before uploading a song:

- Play two or more converted stems together from the beginning and near the end.
- Confirm that transients and vocals remain aligned.
- Confirm that converted part files report mono.
- Confirm that filenames remain readable and identify the part.
- Confirm that every MP3 has the same intended total song length.

## Technical References

- [MDN Web audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)
- [MDN `decodeAudioData()`](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- [FFmpeg codec documentation](https://ffmpeg.org/ffmpeg-codecs.html#libmp3lame)
