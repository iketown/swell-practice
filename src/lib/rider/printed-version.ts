import { canonical, type Published } from "./model";

export type PrintedVersion = {
  date: string;
  issue?: string;
  version?: string;
  revision?: string;
};

export function printedUrl(record: Published, preview: boolean) {
  const url = new URL(canonical);
  url.searchParams.set("ver", record.date);
  if (preview && record.versionId) {
    url.searchParams.set("v", record.versionId);
    url.searchParams.set(
      "r",
      String(record.versionRevision ?? record.revision),
    );
  } else {
    url.searchParams.set("rev", String(record.revision));
  }
  return url.toString();
}

export function isCurrentPrint(scanned: PrintedVersion, current: Published) {
  if (scanned.version !== undefined || scanned.revision !== undefined) {
    return (
      scanned.version === current.versionId &&
      scanned.revision === String(current.versionRevision)
    );
  }
  return (
    scanned.date === current.date &&
    (scanned.issue === undefined || scanned.issue === String(current.revision))
  );
}
