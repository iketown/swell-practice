import type { RiderRelease } from "./releases";

import catalog from "../../../public/production-documents/catalog.json";

export function productionDownloads(edition: RiderRelease) {
  const entry = catalog.find(({ code, id, revision }) =>
    code === edition.code && id === edition.id && revision === edition.revision
  );
  if (!entry) return null;
  const base = "/production-documents/" + entry.code + "/";
  return {
    packet: base + entry.packet.file,
    pages: entry.packet.pages,
    documents: entry.documents.map(doc => ({ ...doc, href: base + doc.file })),
  };
}
