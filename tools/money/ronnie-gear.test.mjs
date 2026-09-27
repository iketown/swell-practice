import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GEAR_LOCATIONS,
  DEFAULT_GEAR_PARTIES,
} from "../../src/lib/gear/domain.ts";
import {
  containerContents,
  describeGearAsset,
  directGearCheckIn,
  directGearQuestion,
  findGear,
  gearAtLocation,
  gearOverview,
  resolveGearDestination,
} from "../../src/lib/gear/ronnie.ts";
import { planInventoryCheckIn } from "../../src/lib/gear/check-in-plan.ts";

const at = 1_790_000_000_000;
const asset = (id, code, label, overrides = {}) => ({
  id, assetTag: code, label, definitionId: "", lifecycleStatus: "active",
  stageOnly: false, tags: [], photos: [], createdAt: at - 10000, updatedAt: at - 10000,
  ...overrides,
});
const assets = [
  asset("stand-one", "0200", "Boom mic stand", {
    ownerPartyId: "party-the-swell", currentPlacement: { kind: "location", locationId: "location-cron-house" },
    effectiveLocationId: "location-cron-house", lastPlacedAt: at - 1000,
  }),
  asset("stand-two", "0201", "Microphone stand", {
    ownerPartyId: "party-ike", currentPlacement: { kind: "container", containerAssetId: "case" },
    effectiveLocationId: "location-cron-house", lastPlacedAt: at - 9000,
  }),
  asset("mic", "0100", "SM57 microphone", {
    currentPlacement: { kind: "location", locationId: "location-ike-house" },
    effectiveLocationId: "location-ike-house", lastPlacedAt: at - 8000,
  }),
  asset("case", "1001", "Stand case", {
    canContainAssets: true, expectedContentAssetIds: ["stand-one", "stand-two"],
    currentPlacement: { kind: "location", locationId: "location-cron-house" },
    effectiveLocationId: "location-cron-house", lastPlacedAt: at - 1000,
  }),
];
const snapshot = {
  assets,
  locations: DEFAULT_GEAR_LOCATIONS,
  parties: DEFAULT_GEAR_PARTIES,
  definitions: [],
  orders: [],
};

test("Ronnie finds mic stands and distinguishes a direct check-in from inherited case location", () => {
  assert.deepEqual(directGearQuestion("Where are our mic stands?"), { mode: "search", query: "mic stands" });
  const result = findGear(snapshot, "mic stands");
  assert.equal(result.total, 2);
  assert.deepEqual(result.assets.map((item) => item.code), ["0200", "0201"]);
  assert.equal(result.assets[0].location, "Cron's house");
  assert.match(result.assets[1].location, /Cron's house.*Stand case/);
  assert.equal(result.assets[1].lastDirectCheckInAt, at - 9000);
  assert.equal(result.assets[1].locationObservationAt, at - 1000);
  assert.equal(result.assets[1].owner, "Ike");
  assert.equal(describeGearAsset(snapshot, assets[2]).link, "/g/0100");
});

test("location and container views use effective location and compare actual versus expected contents", () => {
  const location = gearAtLocation(snapshot, "Chris's house");
  assert.deepEqual(location.assets.map((item) => item.code), ["0200", "0201", "1001"]);
  const container = containerContents(snapshot, "1001");
  assert.equal(container.found, true);
  assert.deepEqual(container.actual.map((item) => item.code), ["0201"]);
  assert.deepEqual(container.missingExpected, [{ code: "0200", label: "Boom mic stand" }]);
  assert.deepEqual(container.unexpected, []);
  const overview = gearOverview(snapshot);
  assert.equal(overview.totalGearRecords, 4);
  assert.deepEqual(overview.containersNeedingReview, [{ code: "1001", label: "Stand case", missing: 1, unexpected: 0 }]);
});

test("clear chat moves resolve exact gear codes and Chris/Cron location aliases", () => {
  assert.deepEqual(directGearCheckIn("Hey Ronnie, I just moved 1501, 1502 and 2003 to Chris's house."), {
    codes: ["1501", "1502", "2003"], destination: "Chris's house",
  });
  assert.deepEqual(directGearCheckIn("Check in gear 0200 at rehearsal studio"), {
    codes: ["0200"], destination: "rehearsal studio",
  });
  assert.equal(directGearCheckIn("Could you maybe move 0200 to Chris's house?"), null);
  assert.equal(directGearCheckIn("I moved 0200 and a mystery cable to Chris's house"), null);
  assert.equal(resolveGearDestination(snapshot, "Chris's house")?.id, "location-cron-house");
  assert.equal(resolveGearDestination(snapshot, "1001")?.id, "case");
  assert.equal(resolveGearDestination(snapshot, "Chris"), null);
});

test("shared planner moves connected gear together and propagates a moved case without fake child scans", () => {
  const connected = [
    asset("a", "1501", "Rack unit A", { connectionSetId: "set", currentPlacement: { kind: "location", locationId: "location-ike-house" }, effectiveLocationId: "location-ike-house" }),
    asset("b", "1502", "Rack unit B", { connectionSetId: "set", currentPlacement: { kind: "location", locationId: "location-ike-house" }, effectiveLocationId: "location-ike-house" }),
    ...assets.slice(1, 2),
    assets[3],
  ];
  const result = planInventoryCheckIn(connected, [{ id: "set", memberAssetIds: ["a", "b"], links: [], signalConnectors: [], createdAt: at, updatedAt: at }], DEFAULT_GEAR_LOCATIONS, {
    sourceAssetIds: ["a", "case"], destination: { kind: "location", locationId: "location-ike-car" },
    method: "agent_chat", actorId: "founder", operationId: "chat-1", checkedInAt: at,
  });
  assert.deepEqual(result.checkIns.map((item) => item.assetId), ["a", "b", "case"]);
  assert.ok(result.checkIns.every((item) => item.method === "agent_chat" && item.operationId === "chat-1"));
  assert.equal(result.propagatedAssets.find((item) => item.id === "stand-two").effectiveLocationId, "location-ike-car");
  assert.ok(!result.checkIns.some((item) => item.assetId === "stand-two"));
  assert.throws(() => planInventoryCheckIn(connected, [], DEFAULT_GEAR_LOCATIONS, {
    sourceAssetIds: ["missing"], destination: { kind: "location", locationId: "location-ike-car" },
    method: "agent_chat", actorId: "founder", operationId: "bad", checkedInAt: at,
  }), /no longer exists/);
});
