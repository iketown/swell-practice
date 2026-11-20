import type { RiderRelease } from "./releases";

import catalog from "../../../public/production-documents/catalog.json";

export function productionDownloads(edition: RiderRelease) {
  const entry = catalog.find(({ code, id, revision }) =>
    code === edition.code && id === edition.id && revision === edition.revision
  );
  if (!entry) return null;
  const base = "/production-documents/" + entry.code + "/";
  const documents = entry.documents.map(doc => ({ ...doc, href: base + doc.file }));
  const packet = entry.packet && { ...entry.packet, href: base + entry.packet.file };
  return { packet, featured: packet ? undefined : documents[0], documents };
}
