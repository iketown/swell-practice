import { z } from "zod";

export const releaseCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9.-]{0,62}[a-z0-9]$|^[a-z0-9]$/,
    "Use up to 64 lowercase letters, numbers, dots or hyphens, starting and ending with a letter or number.",
  );
export type RiderRelease = {
  code: string;
  id: string;
  name: string;
  revision: number;
  date: string;
  replacement: string | null;
  legacyPublicRevision?: number;
};
export type Delivery = { code: string; recipient: string; date: string };
export type RecipientPacket = "Full rider" | "Audio production" | "Backline";

export function packetFromQuery(value?: string): RecipientPacket {
  if (value === "backline") return "Backline";
  if (value === "audio") return "Audio production";
  return "Full rider";
}

export function checkHref(
  code: string,
  packet: RecipientPacket = "Full rider",
  path: "/sp" | "/sp/rider" = "/sp",
) {
  const query = new URLSearchParams({ ver: code });
  if (packet !== "Full rider")
    query.set("packet", packet === "Backline" ? "backline" : "audio");
  return path + "?" + query;
}

// All displaced releases point directly to a currently approved edition.
export function replaceCopies(
  rows: RiderRelease[],
  target: RiderRelease,
  codes: string[],
) {
  const selected = new Set(codes);
  for (const code of selected) {
    const from = rows.find((row) => row.code === code);
    if (
      !from ||
      (from.replacement && from.replacement !== target.code) ||
      target.replacement ||
      from.id !== target.id ||
      from.revision >= target.revision
    )
      throw new Error(
        "Choose approved, earlier copies of the same setup. Refresh the list if it has changed.",
      );
  }
  return rows.map((row) =>
    selected.has(row.code) || (row.replacement && selected.has(row.replacement))
      ? { ...row, replacement: target.code }
      : row,
  );
}

export function resolveProductionEdition(rows: RiderRelease[], code?: string) {
  const copy = rows.find(row => row.code === code);
  const target = copy?.replacement
    ? rows.find(row => row.code === copy.replacement && row.id === copy.id && !row.replacement)
    : copy;
  const standard = rows
    .filter(row => row.id === "standard" && !row.replacement)
    .sort((a, b) => b.revision - a.revision)[0];
  return { copy, target, standard };
}
