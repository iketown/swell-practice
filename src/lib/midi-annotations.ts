export interface ExtractedMidiAnnotation {
  markerId: string;
  title: string;
  start: number;
  end: number;
  conflict?: string;
}

export interface ExtractedMidiMarker {
  id: string;
  title: string;
  time: number;
}

export interface MidiAnnotationExtraction {
  annotations: ExtractedMidiAnnotation[];
  markers: ExtractedMidiMarker[];
  markerCount: number;
  conflictCount: number;
  midiDuration: number;
  audioDuration?: number;
  closingMarker?: string;
}

type MidiMarker = {
  tick: number;
  title: string;
  sequence: number;
};

type MidiTempo = {
  tick: number;
  microsecondsPerQuarterNote: number;
  sequence: number;
};

const DEFAULT_TEMPO_MICROSECONDS = 500_000;
const MIN_ANNOTATION_DURATION = 0.1;
const MAX_MIDI_FILE_BYTES = 5 * 1024 * 1024;

export function extractAnnotationsFromMidi(
  source: ArrayBuffer,
  audioDuration?: number,
): MidiAnnotationExtraction {
  if (source.byteLength > MAX_MIDI_FILE_BYTES) {
    throw new Error("Choose a MIDI file smaller than 5 MB.");
  }

  const reader = new MidiReader(source);
  const headerId = reader.readAscii(4);
  if (headerId !== "MThd") {
    throw new Error("This is not a valid Standard MIDI file.");
  }

  const headerLength = reader.readUint32();
  if (headerLength < 6) {
    throw new Error("The MIDI header is incomplete.");
  }

  const format = reader.readUint16();
  const trackCount = reader.readUint16();
  const division = reader.readUint16();
  reader.skip(headerLength - 6);

  if (format > 1) {
    throw new Error("MIDI format 2 files are not supported. Export a format 0 or format 1 MIDI file.");
  }

  if (trackCount < 1) {
    throw new Error("The MIDI file does not contain any tracks.");
  }

  if ((division & 0x8000) !== 0) {
    throw new Error("This MIDI file uses SMPTE timing. Export it with musical PPQ timing.");
  }

  const ticksPerQuarterNote = division;
  const markers: MidiMarker[] = [];
  const tempos: MidiTempo[] = [];
  let sequence = 0;
  let endTick = 0;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (reader.readAscii(4) !== "MTrk") {
      throw new Error(`MIDI track ${trackIndex + 1} is missing its track header.`);
    }

    const trackLength = reader.readUint32();
    const trackEnd = reader.offset + trackLength;
    reader.assertAvailable(trackLength);

    let tick = 0;
    let runningStatus: number | null = null;

    while (reader.offset < trackEnd) {
      tick += reader.readVariableLength(trackEnd);
      endTick = Math.max(endTick, tick);

      let status = reader.peekUint8();
      if ((status & 0x80) !== 0) {
        status = reader.readUint8();
        if (status < 0xf0) runningStatus = status;
      } else if (runningStatus !== null) {
        status = runningStatus;
      } else {
        throw new Error(`MIDI track ${trackIndex + 1} contains invalid running status.`);
      }

      if (status === 0xff) {
        const metaType = reader.readUint8();
        const dataLength = reader.readVariableLength(trackEnd);
        const data = reader.readBytes(dataLength, trackEnd);

        if (metaType === 0x06) {
          const title = decodeMidiText(data).trim();
          if (!title) {
            throw new Error("The MIDI file contains a marker without a title.");
          }
          markers.push({ tick, title, sequence });
        } else if (metaType === 0x51 && dataLength === 3) {
          const microsecondsPerQuarterNote =
            data[0] * 65_536 + data[1] * 256 + data[2];
          if (microsecondsPerQuarterNote > 0) {
            tempos.push({ tick, microsecondsPerQuarterNote, sequence });
          }
        }
      } else if (status === 0xf0 || status === 0xf7) {
        const dataLength = reader.readVariableLength(trackEnd);
        reader.readBytes(dataLength, trackEnd);
      } else if (status >= 0x80 && status <= 0xef) {
        const messageType = status & 0xf0;
        reader.readBytes(
          messageType === 0xc0 || messageType === 0xd0 ? 1 : 2,
          trackEnd,
        );
      } else {
        throw new Error(
          `MIDI track ${trackIndex + 1} contains unsupported event 0x${status.toString(16)}.`,
        );
      }

      sequence += 1;
    }

    if (reader.offset !== trackEnd) {
      throw new Error(`MIDI track ${trackIndex + 1} has an invalid length.`);
    }
  }

  if (!markers.length) {
    throw new Error(
      "No MIDI markers were found. Add named markers in your project and export the MIDI again.",
    );
  }

  const orderedMarkers = [...markers].sort(
    (left, right) => left.tick - right.tick || left.sequence - right.sequence,
  );
  const orderedTempos = [...tempos].sort(
    (left, right) => left.tick - right.tick || left.sequence - right.sequence,
  );
  const secondsAtTick = createTickToSecondsConverter(
    orderedTempos,
    ticksPerQuarterNote,
  );
  const validAudioDuration =
    typeof audioDuration === "number" && Number.isFinite(audioDuration) && audioDuration > 0
      ? audioDuration
      : undefined;
  const midiDuration = secondsAtTick(endTick);
  const extractedMarkers = orderedMarkers.map((marker) => ({
    id: String(marker.sequence),
    title: marker.title,
    time: roundMidiTime(secondsAtTick(marker.tick)),
  }));
  const extraction = buildMidiAnnotationExtraction(
    extractedMarkers,
    midiDuration,
    validAudioDuration,
  );

  if (!extraction.annotations.length) {
    throw new Error("The MIDI file only contains an end marker. Add named section markers first.");
  }

  return extraction;
}

export function buildMidiAnnotationExtraction(
  markers: ExtractedMidiMarker[],
  midiDuration: number,
  audioDuration?: number,
): MidiAnnotationExtraction {
  const validAudioDuration =
    typeof audioDuration === "number" && Number.isFinite(audioDuration) && audioDuration > 0
      ? audioDuration
      : undefined;
  const orderedMarkers = [...markers].sort(
    (left, right) => left.time - right.time || Number(left.id) - Number(right.id),
  );
  const lastMarker = orderedMarkers.at(-1);
  const hasClosingMarker = Boolean(lastMarker && /^end$/i.test(lastMarker.title));
  const sectionMarkers = hasClosingMarker ? orderedMarkers.slice(0, -1) : orderedMarkers;
  const markerCountsByTime = new Map<number, number>();

  sectionMarkers.forEach((marker) => {
    markerCountsByTime.set(marker.time, (markerCountsByTime.get(marker.time) ?? 0) + 1);
  });

  const annotations = sectionMarkers.map((marker, index) => {
    const nextBoundary = orderedMarkers
      .slice(index + 1)
      .find((candidate) => candidate.time > marker.time);
    const naturalEnd = nextBoundary?.time ?? validAudioDuration ?? midiDuration;
    const end =
      validAudioDuration && naturalEnd > validAudioDuration
        ? validAudioDuration
        : naturalEnd;

    if (validAudioDuration && marker.time >= validAudioDuration) {
      throw new Error(
        `Marker “${marker.title}” starts after the loaded audio ends. Check that the MIDI and mixer stems share the same start time.`,
      );
    }

    const sharesStartTime = (markerCountsByTime.get(marker.time) ?? 0) > 1;
    const conflict = sharesStartTime
      ? "Another marker has the same start time. Remove all but one."
      : end - marker.time < MIN_ANNOTATION_DURATION
        ? "This marker does not have at least 0.10 seconds before the next boundary."
        : undefined;

    return {
      markerId: marker.id,
      title: marker.title,
      start: roundMidiTime(marker.time),
      end: roundMidiTime(end),
      conflict,
    };
  });

  return {
    annotations,
    markers: orderedMarkers,
    markerCount: orderedMarkers.length,
    conflictCount: annotations.filter((annotation) => annotation.conflict).length,
    midiDuration: roundMidiTime(midiDuration),
    audioDuration: validAudioDuration,
    closingMarker: hasClosingMarker ? lastMarker?.title : undefined,
  };
}

function createTickToSecondsConverter(
  tempos: MidiTempo[],
  ticksPerQuarterNote: number,
) {
  return (targetTick: number) => {
    let elapsedSeconds = 0;
    let previousTick = 0;
    let microsecondsPerQuarterNote = DEFAULT_TEMPO_MICROSECONDS;

    for (const tempo of tempos) {
      if (tempo.tick > targetTick) break;

      elapsedSeconds +=
        ((tempo.tick - previousTick) * microsecondsPerQuarterNote) /
        ticksPerQuarterNote /
        1_000_000;
      previousTick = tempo.tick;
      microsecondsPerQuarterNote = tempo.microsecondsPerQuarterNote;
    }

    return (
      elapsedSeconds +
      ((targetTick - previousTick) * microsecondsPerQuarterNote) /
        ticksPerQuarterNote /
        1_000_000
    );
  };
}

function decodeMidiText(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes).replaceAll("\u0000", "");
}

function roundMidiTime(seconds: number) {
  return Math.round(seconds * 1000) / 1000;
}

class MidiReader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  offset = 0;

  constructor(source: ArrayBuffer) {
    this.bytes = new Uint8Array(source);
    this.view = new DataView(source);
  }

  assertAvailable(length: number, limit = this.bytes.length) {
    if (length < 0 || this.offset + length > limit || this.offset + length > this.bytes.length) {
      throw new Error("The MIDI file is incomplete or corrupted.");
    }
  }

  readAscii(length: number) {
    return String.fromCharCode(...this.readBytes(length));
  }

  readBytes(length: number, limit = this.bytes.length) {
    this.assertAvailable(length, limit);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readUint8() {
    this.assertAvailable(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  peekUint8() {
    this.assertAvailable(1);
    return this.view.getUint8(this.offset);
  }

  readUint16() {
    this.assertAvailable(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  readUint32() {
    this.assertAvailable(4);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  readVariableLength(limit: number) {
    let value = 0;

    for (let index = 0; index < 4; index += 1) {
      this.assertAvailable(1, limit);
      const byte = this.readUint8();
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }

    throw new Error("The MIDI file contains an invalid variable-length value.");
  }

  skip(length: number) {
    this.assertAvailable(length);
    this.offset += length;
  }
}
