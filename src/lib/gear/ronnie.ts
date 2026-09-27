import {
  directAssetPlacement,
  inventoryAssetLocationChain,
  lifecycleLabel,
  type GearLocation,
  type GearParty,
  type InventoryAsset,
  type PurchaseOrder,
} from "@/lib/gear/domain";

export interface GearDefinitionSummary {
  id: string;
  name: string;
  model: string;
  category: string;
}

export interface RonnieGearSnapshot {
  assets: InventoryAsset[];
  locations: GearLocation[];
  parties: GearParty[];
  definitions: GearDefinitionSummary[];
  orders: PurchaseOrder[];
}

const STOP_WORDS = new Set([
  "a", "all", "and", "are", "at", "do", "for", "gear", "have", "i", "in", "is", "item",
  "items", "located", "location", "me", "my", "of", "on", "our", "please", "show", "some",
  "the", "there", "us", "we", "what", "where", "which", "who", "with",
]);

function canonicalToken(value: string) {
  const token = value.toLowerCase();
  if (["chris", "christopher"].includes(token)) return "cron";
  if (["mic", "mics", "microphones"].includes(token)) return "microphone";
  if (["stands", "stand"].includes(token)) return "stand";
  if (["cables", "cords", "cord"].includes(token)) return "cable";
  if (["cases", "bags", "bag"].includes(token)) return "case";
  return token;
}

function tokens(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().match(/[a-z0-9]+/g)?.map(canonicalToken) ?? [];
}

function queryTokens(value: string) {
  return tokens(value).filter((token) => !STOP_WORDS.has(token));
}

function matches(value: string, query: string) {
  const sought = queryTokens(query);
  if (!sought.length) return false;
  const haystack = tokens(value);
  return sought.every((word) => haystack.some((item) => item === word || item.includes(word)));
}

function dictionaries(snapshot: RonnieGearSnapshot) {
  return {
    assets: new Map(snapshot.assets.map((asset) => [asset.id, asset])),
    locations: new Map(snapshot.locations.map((location) => [location.id, location])),
    parties: new Map(snapshot.parties.map((party) => [party.id, party])),
    definitions: new Map(snapshot.definitions.map((definition) => [definition.id, definition])),
    orders: new Map(snapshot.orders.map((order) => [order.id, order])),
  };
}

function locationObservation(asset: InventoryAsset, assets: Map<string, InventoryAsset>) {
  const visited = new Set<string>();
  let cursor = asset;
  for (let depth = 0; depth < 8; depth += 1) {
    if (visited.has(cursor.id)) break;
    visited.add(cursor.id);
    const placement = directAssetPlacement(cursor);
    if (!placement || placement.kind === "location") break;
    const parent = assets.get(placement.containerAssetId);
    if (!parent) break;
    cursor = parent;
  }
  return cursor.lastPlacedAt || undefined;
}

export function describeGearAsset(snapshot: RonnieGearSnapshot, asset: InventoryAsset) {
  const by = dictionaries(snapshot);
  const placement = directAssetPlacement(asset);
  const locationId = asset.effectiveLocationId ?? asset.currentLocationId;
  const definition = by.definitions.get(asset.definitionId);
  const order = by.orders.get(asset.purchaseOrderId ?? "");
  const container = placement?.kind === "container" ? by.assets.get(placement.containerAssetId) : undefined;
  return {
    code: asset.assetTag,
    label: asset.label,
    model: definition?.model || "",
    definition: definition?.name || "",
    category: definition?.category || "",
    tags: asset.tags ?? [],
    lifecycle: lifecycleLabel(asset.lifecycleStatus),
    owner: by.parties.get(asset.ownerPartyId ?? "")?.name || "Owner not recorded",
    location: placement || locationId ? inventoryAssetLocationChain(asset, snapshot.assets, snapshot.locations) : "No check-in location recorded",
    locationId: locationId || "",
    directPlacement: placement?.kind === "container"
      ? `inside ${container ? `${container.label} (${container.assetTag})` : "an unavailable container"}`
      : placement?.kind === "location" ? `at ${by.locations.get(placement.locationId)?.name || "an unnamed location"}` : "not checked in",
    lastDirectCheckInAt: asset.lastPlacedAt || null,
    locationObservationAt: locationObservation(asset, by.assets) || null,
    detailsNeeded: asset.detailsNeeded === true,
    order: order ? { vendor: order.vendor, number: order.orderNumber || "", status: order.status } : null,
    moneyEntryId: asset.moneyEntryId || "",
    link: /^\d{4}$/.test(asset.assetTag) ? `/g/${asset.assetTag}` : "/gear",
  };
}

export function findGear(snapshot: RonnieGearSnapshot, query: string, limit = 25) {
  const by = dictionaries(snapshot);
  const results = snapshot.assets.filter((asset) => {
    const definition = by.definitions.get(asset.definitionId);
    const owner = by.parties.get(asset.ownerPartyId ?? "");
    return matches([
      asset.assetTag, asset.label, asset.serialNumber, ...(asset.tags ?? []),
      definition?.name, definition?.model, definition?.category, owner?.name,
    ].filter(Boolean).join(" "), query);
  }).sort((a, b) => a.assetTag.localeCompare(b.assetTag));
  return { query, total: results.length, shown: Math.min(results.length, limit), assets: results.slice(0, limit).map((asset) => describeGearAsset(snapshot, asset)) };
}

export function gearAtLocation(snapshot: RonnieGearSnapshot, query: string, limit = 30) {
  const locations = snapshot.locations.filter((location) => matches(`${location.name} ${location.kind}`, query));
  const matchingIds = new Set(locations.map((location) => location.id));
  const assets = snapshot.assets.filter((asset) => matchingIds.has(asset.effectiveLocationId ?? asset.currentLocationId ?? ""))
    .sort((a, b) => a.assetTag.localeCompare(b.assetTag));
  return {
    locations: locations.map(({ id, name, kind }) => ({ id, name, kind })),
    total: assets.length,
    shown: Math.min(assets.length, limit),
    assets: assets.slice(0, limit).map((asset) => describeGearAsset(snapshot, asset)),
  };
}

export function containerContents(snapshot: RonnieGearSnapshot, query: string, limit = 30) {
  const container = snapshot.assets.find((asset) => asset.canContainAssets && (
    asset.assetTag.toLowerCase() === query.trim().toLowerCase() || matches(asset.label, query)
  ));
  if (!container) return { found: false as const, query };
  const actual = snapshot.assets.filter((asset) => {
    const placement = directAssetPlacement(asset);
    return placement?.kind === "container" && placement.containerAssetId === container.id;
  });
  const actualIds = new Set(actual.map((asset) => asset.id));
  const expected = container.expectedContentAssetIds;
  const expectedIds = new Set(expected ?? []);
  const byId = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  return {
    found: true as const,
    container: describeGearAsset(snapshot, container),
    manifestConfigured: expected !== undefined,
    actualCount: actual.length,
    actual: actual.slice(0, limit).map((asset) => describeGearAsset(snapshot, asset)),
    missingExpected: expected?.filter((id) => !actualIds.has(id)).map((id) => {
      const asset = byId.get(id);
      return asset ? { code: asset.assetTag, label: asset.label } : { code: "", label: "Removed inventory item" };
    }) ?? [],
    unexpected: expected ? actual.filter((asset) => !expectedIds.has(asset.id)).map((asset) => ({ code: asset.assetTag, label: asset.label })) : [],
  };
}

export function gearOverview(snapshot: RonnieGearSnapshot) {
  const byLocation = snapshot.locations.map((location) => ({
    name: location.name,
    count: snapshot.assets.filter((asset) => (asset.effectiveLocationId ?? asset.currentLocationId) === location.id).length,
  })).filter((location) => location.count).sort((a, b) => b.count - a.count);
  const awaiting = snapshot.assets.filter((asset) => asset.lifecycleStatus === "awaiting_check_in");
  const onHandWithoutLocation = snapshot.assets.filter((asset) => asset.lifecycleStatus === "active"
    && !directAssetPlacement(asset) && !asset.effectiveLocationId && !asset.currentLocationId);
  const containersNeedingReview = snapshot.assets.filter((asset) => asset.canContainAssets && asset.expectedContentAssetIds !== undefined)
    .map((asset) => containerContents(snapshot, asset.assetTag, 0))
    .filter((result) => result.found && (result.missingExpected.length > 0 || result.unexpected.length > 0))
    .map((result) => result.found ? ({ code: result.container.code, label: result.container.label,
      missing: result.missingExpected.length, unexpected: result.unexpected.length }) : null)
    .filter((result) => result !== null);
  const lifecycleCounts = Object.fromEntries([...new Set(snapshot.assets.map((asset) => asset.lifecycleStatus))]
    .map((status) => [lifecycleLabel(status), snapshot.assets.filter((asset) => asset.lifecycleStatus === status).length]));
  return {
    totalGearRecords: snapshot.assets.length,
    lifecycleCounts,
    byLastKnownLocation: byLocation,
    awaitingCheckIn: awaiting.length,
    awaitingCheckInExamples: awaiting.slice(0, 10).map((asset) => ({ code: asset.assetTag, label: asset.label })),
    onHandWithoutLocation: onHandWithoutLocation.length,
    onHandWithoutLocationExamples: onHandWithoutLocation.slice(0, 10).map((asset) => ({ code: asset.assetTag, label: asset.label })),
    containersNeedingReview: containersNeedingReview.slice(0, 15),
    caveat: "Locations are last recorded check-in observations, not live GPS or proof that gear was verified for a current trip.",
  };
}

export type DirectGearQuestion = { mode: "search" | "overview" | "location" | "container" | "history"; query: string };

export interface DirectGearCheckIn {
  codes: string[];
  destination: string;
}

export function directGearCheckIn(text: string): DirectGearCheckIn | null {
  const clean = text.trim().replace(/[.!]+$/, "");
  if (/[?]/.test(clean) || /\b(?:maybe|might|should|could|would|don't|not yet)\b/i.test(clean)) return null;
  const command = clean.replace(/^hey\s+ronnie(?:-bot)?[,!:]?\s*/i, "")
    .replace(/^please\s+/i, "")
    .replace(/^(?:i|we)\s+(?:just\s+)?/i, "");
  const match = /^(?:moved?|put|brought|took|check(?:ed)?\s+in)\s+(.+?)\s+(?:to|at|into|in)\s+(.+)$/i.exec(command);
  if (!match) return null;
  const codes = [...new Set(match[1].match(/\b\d{4}\b/g) ?? [])];
  if (!codes.length || codes.length > 30) return null;
  const remaining = match[1].replace(/\b\d{4}\b/g, "").replace(/\b(?:gear|items?|cables?|codes?|and|the|our|my)\b/gi, "").replace(/[,&\s-]/g, "");
  if (remaining) return null;
  return { codes, destination: match[2].trim() };
}

function normalizedLocation(value: string) {
  return tokens(value.replace(/\bchris(?:topher)?\b/gi, "Cron")).filter((token) => !["the", "our", "my"].includes(token)).join(" ");
}

export function resolveGearDestination(snapshot: RonnieGearSnapshot, query: string) {
  const clean = query.trim().replace(/[.!?]+$/, "").replace(/^(?:the|our)\s+/i, "");
  const code = /\b\d{4}\b/.exec(clean)?.[0];
  if (code) {
    const matches = snapshot.assets.filter((asset) => asset.assetTag === code && asset.canContainAssets);
    return matches.length === 1
      ? { kind: "container" as const, id: matches[0].id, name: `${matches[0].label} (${code})` }
      : null;
  }
  const normalized = normalizedLocation(clean);
  if (["ike", "cron"].includes(normalized)) return null;
  const active = snapshot.locations.filter((location) => location.status === "active");
  const exact = active.filter((location) => normalizedLocation(location.name) === normalized);
  const candidates = exact.length ? exact : active.filter((location) => normalized && normalizedLocation(location.name).includes(normalized));
  return candidates.length === 1
    ? { kind: "location" as const, id: candidates[0].id, name: candidates[0].name }
    : null;
}

export function directGearQuestion(text: string): DirectGearQuestion | null {
  const question = text.trim().replace(/[?.!]+$/, "");
  if (!question || /\b(bought|buy|paid|receipt|refund|cost|price|purchase|reimburse|owed|balance)\b/i.test(question)) return null;
  if (/^(?:what(?:'s| is) (?:happening|going on) with|give me (?:a |the )?(?:gear|inventory) (?:status|overview)|(?:gear|inventory) (?:status|overview))\s*(?:our |the )?(?:gear|inventory)?$/i.test(question))
    return { mode: "overview", query: "" };
  const history = /^(?:when|where) (?:was|were) (.+?) (?:last )?(?:checked in|scanned)$/i.exec(question);
  if (history) return { mode: "history", query: history[1].trim() };
  const contents = /^(?:what(?:'s| is)|which gear is) (?:inside|in) (.+)$/i.exec(question);
  if (contents) return { mode: "container", query: contents[1].trim() };
  const atLocation = /^(?:what|which) (?:gear|equipment|items?) (?:is|are|do we have) (?:at|in) (.+)$/i.exec(question);
  if (atLocation) return { mode: "location", query: atLocation[1].trim() };
  const where = /^where (?:are|is|were|do we have) (.+)$/i.exec(question);
  if (where) return { mode: "search", query: where[1].replace(/^(?:our|the|my)\s+/i, "").trim() };
  return null;
}
