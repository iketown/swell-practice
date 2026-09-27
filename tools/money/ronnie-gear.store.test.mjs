import test from "node:test";
import assert from "node:assert/strict";
import { getServerFirestore } from "../../src/lib/server/firebase-admin.ts";
import {
  answerDirectGearQuestion,
  gearStatusForRonnie,
  recordRonnieGearCheckIn,
} from "../../src/lib/server/ronnie-gear.ts";
import { runMoneyAgent } from "../../src/lib/server/money-agent.ts";

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_ADMIN_PROJECT_ID !== "demo-swell-money")
  throw new Error("Tests must run on the demo-swell-money emulator; never a live database.");
const db = getServerFirestore();
await fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-swell-money/databases/(default)/documents`,
  { method: "DELETE" },
);

const now = Date.now();
const seed = async (id, code, label, extra = {}) => db.doc(`inventoryAssets/${id}`).set({
  assetTag: code, label, lifecycleStatus: "active", definitionId: "", tags: [],
  ownerPartyId: "party-the-swell", currentPlacement: { kind: "location", locationId: "location-ike-house" },
  effectiveLocationId: "location-ike-house", currentLocationId: "location-ike-house",
  lastPlacedAt: now - 60000, createdAt: now - 60000, updatedAt: now - 60000,
  ...extra,
});

test("Ronnie's authenticated server check-in is atomic, replay-safe, and updates inherited locations", async () => {
  await Promise.all([
    seed("rack-a", "1501", "Mic stand rack A", { connectionSetId: "rack-set", moneyEntryId: "money-original" }),
    seed("rack-b", "1502", "Mic stand rack B", { connectionSetId: "rack-set" }),
    seed("stand", "2003", "Boom mic stand"),
    seed("case", "1001", "Stand case", { canContainAssets: true, expectedContentAssetIds: ["child"] }),
    seed("child", "0200", "Mic stand in case", {
      currentPlacement: { kind: "container", containerAssetId: "case" },
      effectiveLocationId: "location-ike-house", currentLocationId: "location-ike-house",
      ancestorContainerIds: ["case"], locationInheritedFromAssetId: "case",
    }),
  ]);
  await db.doc("inventoryConnectionSets/rack-set").set({
    memberAssetIds: ["rack-a", "rack-b"], links: [], signalConnectors: [],
    createdAt: now, updatedAt: now,
  });

  const before = await answerDirectGearQuestion({ mode: "search", query: "mic stands" }, db);
  assert.match(before.text, /Ike's house/);
  assert.ok(before.codes.includes("2003"));

  const request = "Hey Ronnie, I just moved 1501 and 2003 to Chris's house.";
  const result = await recordRonnieGearCheckIn(request, "message-001", "founder-uid", db);
  assert.deepEqual(result.codes, ["1501", "1502", "2003"]);
  assert.deepEqual(result.additionalCodes, ["1502"]);
  assert.equal(result.destination, "Cron's house");
  const repeated = await recordRonnieGearCheckIn(request, "message-001", "founder-uid", db);
  assert.deepEqual(repeated.codes, result.codes);
  for (const id of ["rack-a", "rack-b", "stand"]) {
    const doc = (await db.doc(`inventoryAssets/${id}`).get()).data();
    assert.equal(doc.currentPlacement.locationId, "location-cron-house");
    assert.equal(doc.effectiveLocationId, "location-cron-house");
    const events = await db.collection(`inventoryAssets/${id}/checkIns`).get();
    assert.equal(events.size, 1);
    assert.equal(events.docs[0].data().method, "agent_chat");
    assert.equal(events.docs[0].data().actorId, "founder-uid");
  }
  assert.equal((await db.doc("inventoryAssets/rack-a").get()).data().moneyEntryId, "money-original");
  assert.equal((await db.doc("inventoryAssets/rack-a").get()).data().ownerPartyId, "party-the-swell");
  assert.equal((await db.doc("gearLocations/location-cron-house").get()).data().name, "Cron's house");

  const countBeforeFailure = (await db.collection("gearAgentCheckIns").get()).size;
  await assert.rejects(() => recordRonnieGearCheckIn("I moved 1501 and 9999 to Chris's house", "message-002", "founder-uid", db), /9999.*Nothing was checked in/);
  await assert.rejects(() => recordRonnieGearCheckIn("I moved 1501 to Chris", "message-003", "founder-uid", db), /one destination/);
  assert.equal((await db.collection("gearAgentCheckIns").get()).size, countBeforeFailure);
  assert.equal((await db.collection("inventoryAssets/rack-a/checkIns").get()).size, 1);

  await recordRonnieGearCheckIn("I moved 1001 to Chris's house", "message-004", "founder-uid", db);
  const child = (await db.doc("inventoryAssets/child").get()).data();
  assert.equal(child.effectiveLocationId, "location-cron-house");
  assert.equal(child.currentPlacement.containerAssetId, "case");
  assert.equal((await db.collection("inventoryAssets/child/checkIns").get()).size, 0);
  const history = await gearStatusForRonnie("history", "1001", db);
  assert.equal(history.checkIns[0].destination, "Cron's house");
  const after = await answerDirectGearQuestion({ mode: "search", query: "mic stands" }, db);
  assert.match(after.text, /Cron's house/);
});

test("the authenticated chat records a clear move and answers Gear questions without model credit", async () => {
  const priorKey = process.env.OPEN_ROUTER_API_KEY;
  delete process.env.OPEN_ROUTER_API_KEY;
  try {
    const message = { id: "gear-chat-message-001", text: "Hey Ronnie, I just moved 2003 to Ike's car.", receiptIds: [] };
    const reply = await runMoneyAgent(message, "founder-uid", "ike");
    assert.match(reply.text, /Checked in 2003 at Ike's car/);
    assert.deepEqual(reply.gearCodes, ["2003"]);
    assert.equal((await db.collection("inventoryAssets/stand/checkIns").get()).size, 2);
    const repeated = await runMoneyAgent(message, "founder-uid", "ike");
    assert.equal(repeated.id, reply.id);
    assert.equal((await db.collection("inventoryAssets/stand/checkIns").get()).size, 2);

    const answer = await runMoneyAgent({ id: "gear-chat-message-002", text: "Where are our mic stands?", receiptIds: [] }, "founder-uid", "ike");
    assert.match(answer.text, /Ike's car/);
    assert.ok(answer.gearCodes.includes("2003"));
  } finally {
    if (priorKey === undefined) delete process.env.OPEN_ROUTER_API_KEY;
    else process.env.OPEN_ROUTER_API_KEY = priorKey;
  }
});
