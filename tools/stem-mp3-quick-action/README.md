# Convert to Stem MP3

This is the converter behind the Finder Quick Action named
**Convert to Stem MP3**.

Select one or more WAV or AIFF part stems in Finder, right-click, and choose:

`Quick Actions` → `Convert to Stem MP3`

The converter writes each MP3 beside its source file and keeps the source:

- `.wav`, `.wave`, `.aif`, `.aiff`, and `.aifc` inputs are accepted
- every input becomes a mono MP3 at 128 kbps CBR
- stereo inputs are downmixed to mono
- source sample rate preserved when the selected batch is 44.1 or 48 kHz
- metadata stripped
- existing MP3s never overwritten

The complete rationale and export rules are in
[`docs/MIXER_STEM_ENCODING.md`](../../docs/MIXER_STEM_ENCODING.md).

The action validates the whole selection before converting. It stops without
creating outputs if the batch mixes sample rates, includes unreadable audio, or
contains a file with more than two channels.

The installed action depends on Homebrew FFmpeg at `/opt/homebrew/bin` or
`/usr/local/bin`.
