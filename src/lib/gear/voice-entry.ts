import { normalizeInventoryAssetCode } from "@/lib/gear/domain";

const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
};

const SMALL_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  oh: 0,
  o: 0,
  one: 1,
  two: 2,
  to: 2,
  too: 2,
  three: 3,
  four: 4,
  for: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ate: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const FILLER_WORDS = new Set(["asset", "code", "item", "number", "please", "is"]);

function normalizedTokens(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !FILLER_WORDS.has(token));
}

function codeFromDigitSequence(tokens: string[]) {
  if (!tokens.length) return "";
  const pieces = tokens.map((token) => {
    if (/^\d+$/.test(token)) return token;
    return DIGIT_WORDS[token] ?? "";
  });
  if (pieces.some((piece) => !piece)) return "";
  const digits = pieces.join("");
  return digits.length <= 4 ? normalizeInventoryAssetCode(digits) : "";
}

function numberFromCardinalWords(tokens: string[]) {
  if (!tokens.length) return null;
  let total = 0;
  let current = 0;
  let recognized = false;

  for (const token of tokens) {
    if (token === "and") continue;
    if (/^\d{1,4}$/.test(token)) {
      if (tokens.length !== 1) return null;
      return Number(token);
    }
    if (token in SMALL_NUMBER_WORDS) {
      current += SMALL_NUMBER_WORDS[token];
      recognized = true;
      continue;
    }
    if (token in TENS_WORDS) {
      current += TENS_WORDS[token];
      recognized = true;
      continue;
    }
    if (token === "hundred") {
      current = Math.max(current, 1) * 100;
      recognized = true;
      continue;
    }
    if (token === "thousand") {
      total += Math.max(current, 1) * 1000;
      current = 0;
      recognized = true;
      continue;
    }
    return null;
  }

  return recognized ? total + current : null;
}

export function spokenGearAssetCode(value: string) {
  const tokens = normalizedTokens(value);
  const digitCode = codeFromDigitSequence(tokens);
  if (digitCode) return digitCode;
  const cardinal = numberFromCardinalWords(tokens);
  return cardinal === null ? "" : normalizeInventoryAssetCode(String(cardinal));
}

export function spokenGearAssetCodes(transcript: string) {
  const normalized = transcript
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const phrases = [...normalized.matchAll(/\b(?:gear|cable)\b([\s\S]*?)(?=\b(?:gear|cable)\b|$)/g)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  const codes: string[] = [];
  for (const phrase of phrases) {
    const code = spokenGearAssetCode(phrase);
    if (code) codes.push(code);
  }
  return codes;
}
