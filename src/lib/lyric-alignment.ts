export type LyricAlignmentStatus =
  | "ready"
  | "aligning"
  | "aligned"
  | "error";

export type LyricAlignmentAudio = {
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  downloadUrl: string;
};

export type LyricAlignmentSong = {
  id: string;
  title: string;
  slug: string;
  sortTitle: string;
  lyrics: string;
  audio: LyricAlignmentAudio;
  status: LyricAlignmentStatus;
  errorMessage?: string;
};

export type ElevenLabsAlignmentCharacter = {
  text: string;
  start: number;
  end: number;
};

export type ElevenLabsAlignmentWord = ElevenLabsAlignmentCharacter & {
  loss: number;
};

export type ElevenLabsAlignment = {
  characters: ElevenLabsAlignmentCharacter[];
  words: ElevenLabsAlignmentWord[];
  loss: number;
};

export type SyllableTiming = {
  id: string;
  text: string;
  start: number;
  end: number;
};

export type EditorWord = ElevenLabsAlignmentWord & {
  id: string;
  sourceIndex: number;
  syllables?: SyllableTiming[];
};

export type EditorLine = {
  id: string;
  words: EditorWord[];
};

export type StoredLyricAlignment = {
  version: 1;
  lines: EditorLine[];
  globalOffset: number;
};

export type LyricAlignmentWorkspace = {
  song: LyricAlignmentSong;
  original: ElevenLabsAlignment | null;
  current: StoredLyricAlignment | null;
};

export function roundTiming(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function isElevenLabsAlignment(
  value: unknown,
): value is ElevenLabsAlignment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ElevenLabsAlignment>;
  if (!Number.isFinite(candidate.loss) || !Array.isArray(candidate.words)) {
    return false;
  }

  return candidate.words.every(
    (word) =>
      word &&
      typeof word === "object" &&
      typeof word.text === "string" &&
      Number.isFinite(word.start) &&
      Number.isFinite(word.end) &&
      Number.isFinite(word.loss),
  );
}

export function isStoredLyricAlignment(
  value: unknown,
): value is StoredLyricAlignment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredLyricAlignment>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.lines) &&
    Number.isFinite(candidate.globalOffset)
  );
}

export function parseLyricAlignment(
  raw: ElevenLabsAlignment,
  lyrics: string,
): EditorLine[] {
  const timedWords = raw.words.flatMap((word, sourceIndex) =>
    word.text.trim()
      ? [
          {
            ...word,
            id: `word-${sourceIndex}`,
            sourceIndex,
          },
        ]
      : [],
  );
  const lyricLineCounts = lyrics
    .split(/\r?\n/)
    .map((line) => line.match(/\S+/g)?.length ?? 0)
    .filter((count) => count > 0);
  const lyricWordCount = lyricLineCounts.reduce(
    (total, count) => total + count,
    0,
  );

  if (lyricLineCounts.length && lyricWordCount === timedWords.length) {
    let wordIndex = 0;
    return lyricLineCounts.map((wordCount, lineIndex) => {
      const words = timedWords.slice(wordIndex, wordIndex + wordCount);
      wordIndex += wordCount;
      return {
        id: `line-${lineIndex}`,
        words,
      };
    });
  }

  const wordsByLine = new Map<number, EditorWord[]>();
  let lineIndex = 0;

  raw.words.forEach((word, sourceIndex) => {
    if (!word.text.trim()) {
      lineIndex += word.text.match(/\n/g)?.length ?? 0;
      return;
    }

    const lineWords = wordsByLine.get(lineIndex) ?? [];
    lineWords.push({
      ...word,
      id: `word-${sourceIndex}`,
      sourceIndex,
    });
    wordsByLine.set(lineIndex, lineWords);
  });

  if (!wordsByLine.size && timedWords.length) {
    return [{ id: "line-0", words: timedWords }];
  }

  return Array.from(wordsByLine.entries()).map(
    ([sourceLine, words], index) => ({
      id: `line-${sourceLine}-${index}`,
      words,
    }),
  );
}

export function createStoredLyricAlignment(
  raw: ElevenLabsAlignment,
  lyrics: string,
): StoredLyricAlignment {
  return {
    version: 1,
    lines: parseLyricAlignment(raw, lyrics),
    globalOffset: 0,
  };
}

export function lyricAlignmentFingerprint(
  alignment: StoredLyricAlignment,
) {
  return JSON.stringify(alignment);
}

export function editorWordWasAdjusted(
  word: EditorWord,
  original: EditorWord | undefined,
) {
  if (!original) return true;
  if (
    roundTiming(word.start) !== roundTiming(original.start) ||
    roundTiming(word.end) !== roundTiming(original.end)
  ) {
    return true;
  }

  const wordSyllables = word.syllables ?? [];
  const originalSyllables = original.syllables ?? [];
  if (wordSyllables.length !== originalSyllables.length) return true;

  return wordSyllables.some((syllable, index) => {
    const source = originalSyllables[index];
    return (
      !source ||
      syllable.text !== source.text ||
      roundTiming(syllable.start) !== roundTiming(source.start) ||
      roundTiming(syllable.end) !== roundTiming(source.end)
    );
  });
}
