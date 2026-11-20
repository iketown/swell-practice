import { plotSchema, type Published } from "./model";
import { standardVersionId } from "./versions";

function legacyKeys(uid: string, versionId: string) {
  const prefix = "swell-stage-plot:draft:" + uid;
  const versionKey = prefix + ":" + versionId;
  return versionId === standardVersionId ? [versionKey, prefix] : [versionKey];
}

export function draftKey(uid: string, versionId: string, revision: number) {
  return legacyKeys(uid, versionId)[0] + ":rev:" + revision;
}

function readEntry(storage: Storage, key: string, versionId: string) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Number.isSafeInteger(data.revision) || data.revision < 0 ||
        (data.versionId !== undefined && data.versionId !== versionId)) return null;
    return { key, revision: Number(data.revision), plot: data.plot, raw };
  } catch {
    return null;
  }
}

export function restoreBrowserDraft(storage: Storage, record: Published, uid: string) {
  const version = record.versionId!;
  const keys = [draftKey(uid, version, record.revision), ...legacyKeys(uid, version)];
  for (const key of keys) {
    const entry = readEntry(storage, key, version);
    if (entry?.revision !== record.revision) continue;
    const parsed = plotSchema.safeParse(entry.plot);
    if (parsed.success) return { ...record, plot: parsed.data };
  }
  return record;
}

export function olderBrowserDrafts(storage: Storage, record: Published, uid: string) {
  const version = record.versionId!;
  const legacy = legacyKeys(uid, version);
  const prefix = legacy[0] + ":rev:";
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  const drafts = new Map<number, { revision: number; raw: string }>();
  for (const key of [...keys, ...legacy]) {
    const entry = readEntry(storage, key, version);
    if (entry && entry.revision < record.revision && !drafts.has(entry.revision))
      drafts.set(entry.revision, { revision: entry.revision, raw: entry.raw });
  }
  return [...drafts.values()].sort((a, b) => b.revision - a.revision);
}

export function clearBrowserDraft(storage: Storage, record: Published, uid: string) {
  const version = record.versionId!;
  storage.removeItem(draftKey(uid, version, record.revision));
  for (const key of legacyKeys(uid, version)) {
    if (readEntry(storage, key, version)?.revision === record.revision) storage.removeItem(key);
  }
}
