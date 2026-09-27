import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  DEFAULT_GEAR_LOCATIONS,
  DEFAULT_GEAR_PARTIES,
  type GearLocation,
  type GearParty,
  type InventoryAsset,
  type InventoryConnectionSet,
  type PurchaseOrder,
} from "@/lib/gear/domain";
import { planInventoryCheckIn } from "@/lib/gear/check-in-plan";
import {
  containerContents,
  describeGearAsset,
  directGearCheckIn,
  findGear,
  gearAtLocation,
  gearOverview,
  resolveGearDestination,
  type DirectGearQuestion,
  type RonnieGearSnapshot,
} from "@/lib/gear/ronnie";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import { MoneyError } from "@/lib/server/money-auth";

function milliseconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function")
    return value.toMillis();
  return undefined;
}

function string(value: unknown) { return typeof value === "string" ? value : ""; }

function assetFromDoc(doc: QueryDocumentSnapshot): InventoryAsset {
  const raw = doc.data();
  const currentLocationId = string(raw.currentLocationId) || undefined;
  const currentPlacement = raw.currentPlacement?.kind === "location" && string(raw.currentPlacement.locationId)
    ? { kind: "location" as const, locationId: string(raw.currentPlacement.locationId) }
    : raw.currentPlacement?.kind === "container" && string(raw.currentPlacement.containerAssetId)
      ? { kind: "container" as const, containerAssetId: string(raw.currentPlacement.containerAssetId) }
      : currentLocationId ? { kind: "location" as const, locationId: currentLocationId } : undefined;
  return {
    ...raw,
    id: doc.id,
    assetTag: string(raw.assetTag) || doc.id,
    label: string(raw.label) || "Unnamed gear",
    definitionId: string(raw.definitionId),
    lifecycleStatus: raw.lifecycleStatus || "planned",
    stageOnly: raw.stageOnly === true,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((item: unknown): item is string => typeof item === "string") : [],
    photos: [],
    currentPlacement,
    currentLocationId,
    effectiveLocationId: string(raw.effectiveLocationId) || currentLocationId,
    ancestorContainerIds: Array.isArray(raw.ancestorContainerIds) ? raw.ancestorContainerIds : [],
    lastPlacedAt: milliseconds(raw.lastPlacedAt),
    createdAt: milliseconds(raw.createdAt) ?? 0,
    updatedAt: milliseconds(raw.updatedAt) ?? 0,
  } as InventoryAsset;
}

function locationFromDoc(doc: QueryDocumentSnapshot): GearLocation {
  const raw = doc.data();
  return { id: doc.id, name: string(raw.name) || "Unnamed location", kind: raw.kind || "other",
    notes: string(raw.notes), status: raw.status === "archived" ? "archived" : "active",
    lastCheckInAt: milliseconds(raw.lastCheckInAt), updatedAt: milliseconds(raw.updatedAt) ?? 0 };
}

function partyFromDoc(doc: QueryDocumentSnapshot): GearParty {
  const raw = doc.data();
  return { id: doc.id, name: string(raw.name) || "Unnamed owner", kind: raw.kind || "person",
    status: raw.status === "archived" ? "archived" : "active", updatedAt: milliseconds(raw.updatedAt) ?? 0 };
}

function mergeDefaults<T extends { id: string }>(defaults: T[], stored: T[]) {
  const result = new Map(defaults.map((item) => [item.id, item]));
  for (const item of stored) result.set(item.id, item);
  return [...result.values()];
}

export async function readRonnieGearSnapshot(db: Firestore = getServerFirestore()): Promise<RonnieGearSnapshot> {
  const [inventory, locations, parties, definitions, orders] = await Promise.all([
    db.collection("inventoryAssets").get(),
    db.collection("gearLocations").get(),
    db.collection("gearParties").get(),
    db.collection("equipmentTemplates").get(),
    db.collection("purchaseOrders").get(),
  ]);
  return {
    assets: inventory.docs.map(assetFromDoc),
    locations: mergeDefaults(DEFAULT_GEAR_LOCATIONS, locations.docs.map(locationFromDoc)),
    parties: mergeDefaults(DEFAULT_GEAR_PARTIES, parties.docs.map(partyFromDoc)),
    definitions: definitions.docs.map((doc) => ({ id: doc.id, name: string(doc.data().name),
      model: string(doc.data().model), category: string(doc.data().category) })),
    orders: orders.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as PurchaseOrder),
  };
}

const chatDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short",
});
function when(value: number | null | undefined) { return value ? chatDate.format(value) : "never"; }

function gearLine(item: ReturnType<typeof describeGearAsset>) {
  const observation = item.lastDirectCheckInAt
    ? `last direct placement update ${when(item.lastDirectCheckInAt)}` : "no direct placement date recorded";
  const inherited = item.locationObservationAt && item.locationObservationAt !== item.lastDirectCheckInAt
    ? `; container location last recorded ${when(item.locationObservationAt)}` : "";
  return `${item.code} ${item.label} — ${item.location} (${item.lifecycle}; ${observation}${inherited})`;
}

export async function gearStatusForRonnie(mode: DirectGearQuestion["mode"], query: string, db: Firestore = getServerFirestore()) {
  const snapshot = await readRonnieGearSnapshot(db);
  if (mode === "search") return findGear(snapshot, query);
  if (mode === "location") return gearAtLocation(snapshot, query);
  if (mode === "container") return containerContents(snapshot, query);
  if (mode === "overview") return gearOverview(snapshot);
  const code = /\b\d{4}\b/.exec(query)?.[0];
  if (!code) return { error: "Please give me the four-digit gear code for check-in history." };
  const asset = snapshot.assets.find((item) => item.assetTag === code);
  if (!asset) return { error: `I couldn't find gear code ${code}.` };
  const events = await db.collection("inventoryAssets").doc(asset.id).collection("checkIns")
    .orderBy("checkedInAt", "desc").limit(8).get();
  return {
    asset: describeGearAsset(snapshot, asset),
    checkIns: events.docs.map((doc) => {
      const data = doc.data();
      const destination = data.destination || (data.containerAssetId
        ? { kind: "container", containerAssetId: data.containerAssetId }
        : { kind: "location", locationId: data.locationId });
      const name = destination.kind === "container"
        ? snapshot.assets.find((item) => item.id === destination.containerAssetId)?.label || "Unknown container"
        : snapshot.locations.find((item) => item.id === destination.locationId)?.name || "Unknown location";
      return { at: milliseconds(data.checkedInAt) ?? 0, destination: name,
        kind: destination.kind, method: string(data.method), notes: string(data.notes) };
    }),
    caveat: "A moved container changes an item's effective location without adding a direct check-in event for the item.",
  };
}

export async function answerDirectGearQuestion(question: DirectGearQuestion, db: Firestore = getServerFirestore()): Promise<{ text: string; codes: string[] }> {
  const result = await gearStatusForRonnie(question.mode, question.query, db);
  if ("error" in result) return { text: String(result.error), codes: [] };
  if (question.mode === "search" && "assets" in result) {
    const value = result as ReturnType<typeof findGear>;
    return { text: value.total
      ? `I found ${value.total} matching Gear ${value.total === 1 ? "record" : "records"}. These are last recorded locations, not live tracking:\n${value.assets.map(gearLine).join("\n")}${value.total > value.shown ? `\nShowing ${value.shown} of ${value.total}; narrow the search for the rest.` : ""}`
      : `I couldn't find “${question.query}” in Gear. No location can be inferred from the ledger alone.`,
    codes: value.assets.map((item) => item.code).slice(0, 12) };
  }
  if (question.mode === "location" && "locations" in result) {
    const value = result as ReturnType<typeof gearAtLocation>;
    return { text: value.locations.length
      ? `${value.total} Gear ${value.total === 1 ? "record has" : "records have"} ${value.locations.map((item) => item.name).join(", ")} as the last recorded location:\n${value.assets.map(gearLine).join("\n") || "No items are currently recorded there."}${value.total > value.shown ? `\nShowing ${value.shown} of ${value.total}.` : ""}`
      : `I couldn't find a named Gear location matching “${question.query}”.`,
    codes: value.assets.map((item) => item.code).slice(0, 12) };
  }
  if (question.mode === "container" && "found" in result) {
    const value = result as ReturnType<typeof containerContents>;
    if (!value.found) return { text: `I couldn't identify a registered container matching “${question.query}”. Give me its four-digit code or name.`, codes: [] as string[] };
    return { text: `${value.container.code} ${value.container.label} — ${value.container.location}. ${value.actualCount} directly packed ${value.actualCount === 1 ? "item" : "items"}:\n${value.actual.map((item) => `${item.code} ${item.label}`).join("\n") || "None recorded."}${value.manifestConfigured ? `\nExpected items missing: ${value.missingExpected.map((item) => `${item.code} ${item.label}`).join(", ") || "none"}. Unexpected items: ${value.unexpected.map((item) => `${item.code} ${item.label}`).join(", ") || "none"}.` : "\nNo expected-content checklist is configured."}`,
      codes: [value.container.code, ...value.actual.map((item) => item.code)].slice(0, 12) };
  }
  if (question.mode === "overview" && "totalGearRecords" in result) {
    const value = result as ReturnType<typeof gearOverview>;
    return { text: `Gear has ${value.totalGearRecords} records. Status: ${Object.entries(value.lifecycleCounts).map(([status, count]) => `${count} ${status.toLowerCase()}`).join(", ") || "none"}. Last recorded locations: ${value.byLastKnownLocation.map((item) => `${item.name} ${item.count}`).join("; ") || "none"}. ${value.awaitingCheckIn} await first check-in; ${value.onHandWithoutLocation} on-hand items have no recorded location. ${value.containersNeedingReview.length} configured container checklists have missing or unexpected items. Locations are check-in observations, not live GPS or proof of packing for a trip. Ask me about a name, code, location, or container for details.`,
      codes: [] as string[] };
  }
  if ("checkIns" in result) {
    const value = result as { asset: ReturnType<typeof describeGearAsset>; checkIns: Array<{ at: number; destination: string; kind: string; method: string }> };
    return { text: `${value.asset.code} ${value.asset.label} is last recorded at ${value.asset.location}. ${value.checkIns.length ? `Recent direct check-ins:\n${value.checkIns.map((item) => `${when(item.at)} — ${item.kind === "container" ? "into" : "at"} ${item.destination} (${item.method})`).join("\n")}` : "No direct check-in event is recorded."} Moving a container updates the item's effective location without creating a new direct scan for the item.`,
      codes: [value.asset.code] };
  }
  return { text: "I couldn't read that Gear request.", codes: [] as string[] };
}

export async function recordRonnieGearCheckIn(text: string, messageId: string, actor: string, db: Firestore = getServerFirestore()) {
  const parsed = directGearCheckIn(text);
  if (!parsed) throw new MoneyError("To check in gear, tell me the exact four-digit codes and a named location, such as ‘I moved 1501 and 1502 to Chris's house.’ Nothing was changed.");
  const operationId = `ronnie-${messageId}`;
  const operationRef = db.doc(`gearAgentCheckIns/${operationId}`);
  const requestHash = createHash("sha256").update(JSON.stringify([parsed.codes, parsed.destination, actor])).digest("hex");
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(operationRef);
    if (previous.exists) {
      if (previous.data()?.requestHash !== requestHash)
        throw new MoneyError("This chat message was already used for a different check-in.", 409);
      return previous.data() as { recorded: true; codes: string[]; additionalCodes: string[]; destination: string; checkedInAt: number };
    }
    const [inventory, locationDocs, connectionDocs] = await Promise.all([
      tx.get(db.collection("inventoryAssets")),
      tx.get(db.collection("gearLocations")),
      tx.get(db.collection("inventoryConnectionSets")),
    ]);
    const snapshot: RonnieGearSnapshot = {
      assets: inventory.docs.map(assetFromDoc),
      locations: mergeDefaults(DEFAULT_GEAR_LOCATIONS, locationDocs.docs.map(locationFromDoc)),
      parties: DEFAULT_GEAR_PARTIES,
      definitions: [],
      orders: [],
    };
    const byCode = new Map(snapshot.assets.map((asset) => [asset.assetTag, asset]));
    const missing = parsed.codes.filter((code) => !byCode.has(code));
    if (missing.length) throw new MoneyError(`I couldn't find gear ${missing.join(", ")}. Nothing was checked in.`);
    const destination = resolveGearDestination(snapshot, parsed.destination);
    if (!destination) throw new MoneyError(`I couldn't identify one destination for “${parsed.destination}”. Use an existing Gear location name or a container's four-digit code. Nothing was checked in.`);
    const checkedInAt = Date.now();
    const connectedSets = connectionDocs.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as InventoryConnectionSet);
    const plan = planInventoryCheckIn(snapshot.assets, connectedSets, snapshot.locations, {
      sourceAssetIds: parsed.codes.map((code) => byCode.get(code)!.id),
      destination: destination.kind === "location"
        ? { kind: "location", locationId: destination.id }
        : { kind: "container", containerAssetId: destination.id },
      method: "agent_chat", actorId: actor, operationId, checkedInAt,
      notes: "Reported in Ronnie chat",
    });
    if (plan.checkIns.length + plan.propagatedAssets.length > 450)
      throw new MoneyError("That check-in affects too many connected or contained items at once. Use smaller groups in Gear.");
    const directlyPlaced = new Set(plan.affectedAssetIds);
    for (const checkIn of plan.checkIns) {
      tx.create(db.doc(`inventoryAssets/${checkIn.assetId}/checkIns/${checkIn.id}`), {
        ...checkIn,
        locationId: checkIn.locationId ?? "",
        containerAssetId: checkIn.destination.kind === "container" ? checkIn.destination.containerAssetId : "",
        latitude: null, longitude: null, accuracyMeters: null,
        checkedInAt: FieldValue.serverTimestamp(),
      });
    }
    for (const asset of plan.propagatedAssets) {
      tx.update(db.doc(`inventoryAssets/${asset.id}`), {
        ...(directlyPlaced.has(asset.id) ? {
          lifecycleStatus: "active", currentPlacement: plan.checkIns[0].destination,
          lastPlacedAt: FieldValue.serverTimestamp(),
        } : {}),
        effectiveLocationId: asset.effectiveLocationId ?? "",
        currentLocationId: asset.currentLocationId ?? "",
        locationInheritedFromAssetId: asset.locationInheritedFromAssetId ?? "",
        ancestorContainerIds: asset.ancestorContainerIds ?? [],
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (destination.kind === "location") {
      const fallback = DEFAULT_GEAR_LOCATIONS.find((location) => location.id === destination.id);
      tx.set(db.doc(`gearLocations/${destination.id}`), {
        ...(fallback && !locationDocs.docs.some((doc) => doc.id === destination.id) ? {
          name: fallback.name, kind: fallback.kind, status: fallback.status,
          notes: fallback.notes ?? "", createdAt: FieldValue.serverTimestamp(),
        } : {}),
        lastCheckInAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    const codes = plan.directlyPlacedAssets.map((asset) => asset.assetTag).sort();
    const result = { recorded: true as const, codes, additionalCodes: codes.filter((code) => !parsed.codes.includes(code)),
      destination: destination.name, checkedInAt, requestHash, actor };
    tx.create(operationRef, result);
    return result;
  });
}
