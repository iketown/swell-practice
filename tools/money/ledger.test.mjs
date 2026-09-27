import test from "node:test";
import assert from "node:assert/strict";
import {
  entrySchema,
  effectsFor,
  totals,
  equalization,
  makeAssets,
  parseMoney,
  assertRefund,
  assertDistribution,
  csvExport,
  safeDraftInput,
} from "../../src/lib/money/domain.ts";
import {
  validTelegramSecret,
  telegramSender,
} from "../../src/lib/server/money-telegram.ts";
import { founderForEmail } from "../../src/lib/money/identity.ts";
import { agentMessageSchema } from "../../src/lib/money/agent.ts";
import { explicitPlaybookRequest, playbookActionSchema } from "../../src/lib/money/playbook.ts";
import { isServerGearLookupQuestion, receiptModelOptions, sanitizeExtractedLinks } from "../../src/lib/server/money-intake.ts";
import { applyGearChoices, applyGearLink, chooseGear, confirmsGearLink, linkedGearConflicts, nextGearChoice, parseGearChoice, planGearChoices, proposeExistingGear } from "../../src/lib/money/gear-match.ts";
import { assembleGearReview, initialGearReview } from "../../src/lib/money/gear-review.ts";

const purchase = (overrides = {}) =>
  entrySchema.parse({
    kind: "purchase",
    date: "2026-09-25",
    description: "Rehearsal",
    amountCents: 100000,
    funding: { ike: 100000, chris: 0, company: 0 },
    ...overrides,
  });
const entry = (input, id = "one") => ({
  ...input,
  id,
  effects: effectsFor(input),
  createdAt: 0,
  createdBy: "test",
  source: "web",
  assetIds: [],
  assetTags: [],
});
test("Ronnie's chat identity follows the signed-in email", () => {
  const configured = {
    ikeEmail: "brian@example.com",
    chrisEmail: "chris@example.com",
  };
  assert.equal(founderForEmail(" BRIAN@example.com ", configured), "ike");
  assert.equal(founderForEmail("chris@example.com", configured), "chris");
  assert.equal(founderForEmail("unknown@example.com", configured), null);
  assert.equal(founderForEmail(null, configured), null);
  assert.equal(founderForEmail("brian@example.com", { ikeEmail: "brian@example.com", chrisEmail: "brian@example.com" }), null);
});
test("Ronnie's message API rejects a browser-supplied speaker", () => {
  const message = { id: "message-123", text: "I bought cables", receiptIds: [] };
  assert.deepEqual(agentMessageSchema.parse(message), message);
  assert.throws(() => agentMessageSchema.parse({ ...message, person: "chris" }));
  assert.doesNotThrow(() => agentMessageSchema.parse({ ...message, text: "", receiptIds: ["receipt-1"] }));
});
test("playbook updates need an explicit standing instruction and a bounded action", () => {
  assert.equal(explicitPlaybookRequest("Remember that Sam gets $1,000 for each video session."), true);
  assert.equal(explicitPlaybookRequest("Going forward, band dinners are company expenses."), true);
  assert.equal(explicitPlaybookRequest("I paid Sam $1,000 for yesterday's video session."), false);
  assert.equal(explicitPlaybookRequest("What is our dinner policy?"), false);
  assert.equal(explicitPlaybookRequest("Do we always pay Sam $1,000?"), false);
  assert.equal(explicitPlaybookRequest("We should maybe pay Sam more?"), false);
  assert.doesNotThrow(() => playbookActionSchema.parse({ action: "create", operationId: "op-12345678", title: "Video pay", rule: "Sam gets $1,000 for each video session." }));
  assert.throws(() => playbookActionSchema.parse({ action: "create", operationId: "op-12345678", title: "Video pay", rule: "x" }));
});
test("receipt reading uses a bounded low-cost vision model and free PDF parsing", () => {
  const override = process.env.OPEN_ROUTER_MONEY_MODEL;
  delete process.env.OPEN_ROUTER_MONEY_MODEL;
  try {
    const image = receiptModelOptions(false);
    const pdf = receiptModelOptions(true);
    assert.equal(image.model, "deepseek/deepseek-v4.1-flash");
    assert.equal(image.reasoning.enabled, false);
    assert.ok(image.max_tokens <= 1200);
    assert.ok(image.provider.max_price.prompt <= 0.4);
    assert.ok(image.provider.max_price.completion <= 1.5);
    assert.ok(image.provider.max_price.image <= 0.005);
    assert.equal("plugins" in image, false);
    assert.deepEqual(pdf.plugins, [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }]);
  } finally {
    if (override === undefined) delete process.env.OPEN_ROUTER_MONEY_MODEL;
    else process.env.OPEN_ROUTER_MONEY_MODEL = override;
  }
});
test("gear lookup questions are handled by Ronnie's server matcher, while payer questions remain", () => {
  assert.equal(isServerGearLookupQuestion("Should the new purchase gear line be matched to the existing X32 mixer entry?"), true);
  assert.equal(isServerGearLookupQuestion("Please provide the internal asset ID for existing gear."), true);
  assert.equal(isServerGearLookupQuestion("Who paid, and is this existing gear?"), false);
});
test("receipt AI cannot assign internal gear IDs or invent a refund's original entry", () => {
  const purchaseLinks = sanitizeExtractedLinks({ kind: "purchase", existingAssetIds: ["wrong"], purchaseOrderId: "guess" }, []);
  assert.deepEqual(purchaseLinks.existingAssetIds, []);
  assert.equal(purchaseLinks.purchaseOrderId, "");
  assert.equal(sanitizeExtractedLinks({ kind: "refund", relatedEntryId: "made-up" }, []).relatedEntryId, "");
  assert.equal(sanitizeExtractedLinks({ kind: "refund", relatedEntryId: "real", vendorOrderNumber: "40486367" }, [{ id: "real", vendorOrderNumber: "40486367" }]).relatedEntryId, "real");
  assert.equal(sanitizeExtractedLinks({ kind: "refund", relatedEntryId: "real", vendorOrderNumber: "other" }, [{ id: "real", vendorOrderNumber: "40486367" }]).relatedEntryId, "");
});
test("Ronnie proposes an exact X32 model but not a different snake, then links only after confirmation", () => {
  const input = purchase({
    vendorOrderNumber: "40486367",
    gear: [
      { label: "X32Rack 40-input digital rack mixer", quantity: 1, isCable: false },
      { label: "STX803F 8-channel snake 9.9 ft", quantity: 1, isCable: true },
    ],
  });
  const assets = [
    { id: "x32", assetTag: "0500", label: "Behringer X32", definitionId: "x32-def", lifecycleStatus: "active" },
    { id: "snake", assetTag: "0600", label: "8-Channel XLR Drop Snake - 25 ft", definitionId: "snake-def", lifecycleStatus: "active" },
  ];
  const definitions = [
    { id: "x32-def", name: "Behringer X32 Rack 40-channel mixer", model: "X32 Rack" },
    { id: "snake-def", name: "StageMASTER 8-Channel XLR Drop Snake - 25 ft", model: "SMAST0800FBM-25" },
  ];
  const proposal = proposeExistingGear(input, assets, definitions, []);
  assert.deepEqual(proposal?.assets.map((asset) => asset.code), ["0500"]);
  const partialOrder = proposeExistingGear(input, assets, definitions, [{
    id: "order-1", orderNumber: "40486367", lines: [{ assetIds: ["x32", "snake"] }],
  }]);
  assert.equal(partialOrder.purchaseOrderId, "");
  const singleAssetOrder = proposeExistingGear(input, assets, definitions, [{
    id: "order-1", orderNumber: "40486367", lines: [{ assetIds: ["x32"] }],
  }]);
  assert.equal(singleAssetOrder.purchaseOrderId, "order-1");
  assert.equal(confirmsGearLink("yes", proposal), true);
  assert.equal(confirmsGearLink("link code 0500", proposal), true);
  assert.equal(confirmsGearLink("yes, link that X32", proposal), true);
  assert.equal(confirmsGearLink("yes, the snake was returned", proposal), false);
  assert.equal(confirmsGearLink("don't link 0500", proposal), false);
  const linked = applyGearLink(input, proposal);
  assert.deepEqual(linked.existingAssetIds, ["x32"]);
  assert.deepEqual(linked.gear.map((line) => line.label), ["STX803F 8-channel snake 9.9 ft"]);
  assert.equal(linked.vendorOrderNumber, "40486367");
  assert.deepEqual(linkedGearConflicts(input, [{ ...assets[0], moneyEntryId: "money-original" }], definitions), [
    { code: "0500", label: "Behringer X32", entryId: "money-original" },
  ]);
});
test("Ronnie offers matching codes or new gear before posting each purchase line", () => {
  const input = purchase({
    vendorOrderNumber: "40486367",
    gear: [
      { label: "X32 Rack mixer", quantity: 1, isCable: false },
      { label: "STX803F snake 9.9 ft", quantity: 1, isCable: true },
    ],
  });
  const assets = [
    { id: "x32", assetTag: "0500", label: "Behringer X32", definitionId: "x32-def", lifecycleStatus: "active" },
    { id: "x32b", assetTag: "0501", label: "Behringer X32 spare", definitionId: "x32-def", lifecycleStatus: "active" },
    { id: "snake", assetTag: "0600", label: "8-Channel XLR Drop Snake - 25 ft", definitionId: "snake-def", lifecycleStatus: "active" },
  ];
  const definitions = [
    { id: "x32-def", name: "Behringer X32 Rack mixer", model: "X32 Rack" },
    { id: "snake-def", name: "8-Channel Drop Snake - 25 ft", model: "SMAST0800FBM-25" },
  ];
  const plan = planGearChoices(input, assets, definitions, []);
  assert.equal(plan.reviewMode, "grid");
  assert.deepEqual(plan.lines[0].candidates.map((candidate) => candidate.code), ["0500", "0501"]);
  assert.deepEqual(plan.lines[1].candidates, []);
  const linkedPlan = planGearChoices(input, [{ ...assets[0], moneyEntryId: "old-purchase" }, assets[1], assets[2]], definitions, []);
  assert.deepEqual(linkedPlan.lines[0].candidates.map((candidate) => candidate.code), ["0501"]);
  assert.equal(parseGearChoice("yes", plan), null);
  assert.deepEqual(parseGearChoice("use code 0500", plan), { kind: "existing", assetIds: ["x32"] });
  assert.throws(() => chooseGear(plan, { kind: "existing", assetIds: ["snake"] }));
  const chosen = chooseGear(plan, { kind: "existing", assetIds: ["x32"] });
  assert.equal(nextGearChoice(chosen).label, "STX803F snake 9.9 ft");
  const complete = chooseGear(chosen, { kind: "new" });
  assert.equal(nextGearChoice(complete), undefined);
  assert.deepEqual(applyGearChoices(input, complete).existingAssetIds, ["x32"]);
  assert.deepEqual(applyGearChoices(input, complete).gear.map((line) => line.label), ["STX803F snake 9.9 ft"]);
  const allNew = chooseGear(chooseGear(plan, { kind: "new" }), { kind: "new" });
  assert.equal(applyGearChoices(input, allNew).gear.length, 2);
});
test("Ronnie waits for four explicit codes or a new-record choice for four cables", () => {
  const input = purchase({ gear: [{ label: "Four 25 ft XLR cables", quantity: 4, isCable: true }] });
  const assets = Array.from({ length: 4 }, (_, index) => ({
    id: `cable-${index}`, assetTag: `000${index + 1}`, label: "25 ft XLR cable", definitionId: "cable-def", lifecycleStatus: "active",
  }));
  assets.push({ id: "mic-stand", assetTag: "0200", label: "20 foot microphone boom stand", definitionId: "stand-def", lifecycleStatus: "active" });
  const plan = planGearChoices(input, assets, [{ id: "cable-def", name: "25 ft XLR cable", model: "" }], []);
  assert.equal(plan.lines[0].candidates.length, 4);
  const wrongKind = planGearChoices(purchase({ gear: [{ label: "20 foot instrument cable", quantity: 1, isCable: true }] }), [
    { id: "mic", assetTag: "0102", label: "Instrument microphone", definitionId: "mic-def", lifecycleStatus: "active" },
  ], [{ id: "mic-def", name: "Instrument microphone", model: "" }], []);
  assert.deepEqual(wrongKind.lines[0].candidates, []);
  const quarterInchPlug = planGearChoices(purchase({ gear: [
    { label: "Elebase 1/4 Inch TRS Instrument Cable 20ft 2-Pack", quantity: 1, isCable: true },
  ] }), [
    { id: "trs-20", assetTag: "0035", label: "TRS-M to TRS-M", definitionId: "trs-def", cableLengthInches: 240, lifecycleStatus: "active" },
  ], [{ id: "trs-def", name: "TRS cable", model: "" }], []);
  assert.deepEqual(quarterInchPlug.lines[0].candidates.map((candidate) => candidate.code), ["0035"]);
  const shorthandCables = planGearChoices(purchase({ gear: [
    { label: "20 Foot XLR Mic Microphone Cable 2 Pack", quantity: 2, isCable: true },
    { label: "XLR Female to 1/4 inch Female Jack Socket Audio Adapter 4-Pcs", quantity: 2, isCable: false },
  ] }), [
    { id: "xlr-20-a", assetTag: "0016", label: "XLR-F → XLR-M", cableLengthInches: 240, lifecycleStatus: "active" },
    { id: "xlr-20-b", assetTag: "0017", label: "XLR-F → XLR-M", cableLengthInches: 240, lifecycleStatus: "active" },
    { id: "adapter-a", assetTag: "0030", label: "XLR-F → TS-F", cableLengthInches: 3, lifecycleStatus: "active" },
    { id: "adapter-b", assetTag: "0031", label: "XLR-F → TS-F", cableLengthInches: 3, lifecycleStatus: "active" },
  ], [], []);
  assert.deepEqual(shorthandCables.lines[0].candidates.map((candidate) => candidate.code), ["0016", "0017"]);
  assert.deepEqual(shorthandCables.lines[1].candidates.map((candidate) => candidate.code), ["0030", "0031"]);
  assert.equal(parseGearChoice("use code 0001", plan), null);
  assert.deepEqual(parseGearChoice("use codes 0001, 0002, 0003, 0004", plan), {
    kind: "existing", assetIds: ["cable-0", "cable-1", "cable-2", "cable-3"],
  });
  const newPlan = chooseGear(plan, { kind: "new" });
  assert.equal(applyGearChoices(input, newPlan).gear[0].quantity, 4);
});
test("a multi-item receipt reviews Ronnie's guesses and posts only the edited gear mapping", () => {
  const lines = [
    { label: "X32 Rack mixer", quantity: 1, isCable: false, definitionId: "", manufacturer: "" },
    { label: "25 ft XLR cable", quantity: 3, isCable: true, definitionId: "", manufacturer: "" },
  ];
  const plan = planGearChoices(purchase({ gear: lines }), [
    { id: "x32", assetTag: "0500", label: "Behringer X32", definitionId: "x32-def", lifecycleStatus: "active" },
    { id: "cable1", assetTag: "0001", label: "25 ft XLR cable", definitionId: "cable-def", lifecycleStatus: "active" },
  ], [
    { id: "x32-def", name: "Behringer X32 Rack", model: "X32 Rack" },
    { id: "cable-def", name: "25 ft XLR cable", model: "" },
  ], []);
  const guesses = initialGearReview(lines, plan);
  assert.deepEqual(guesses[0].assetIds, ["x32"]);
  assert.equal(guesses[0].reviewed, false);
  assert.deepEqual(guesses[1].assetIds, []);
  assert.throws(() => assembleGearReview(lines, guesses, []), /Review the gear match/);
  const corrected = [
    { assetIds: ["x32"], reviewed: true, suggested: false },
    { assetIds: ["cable1"], reviewed: true, suggested: false },
  ];
  const result = assembleGearReview(lines, corrected, []);
  assert.deepEqual(result.existingAssetIds, ["x32", "cable1"]);
  assert.deepEqual(result.gear.map((line) => [line.label, line.quantity]), [["25 ft XLR cable", 2]]);
  assert.throws(() => assembleGearReview(lines, corrected, ["x32"]), /only be linked to one/);
});
test("a manually added receipt item stays pending until new gear is explicitly approved", () => {
  const lines = [{ label: "Tripod phone mount", quantity: 2, isCable: false, definitionId: "", manufacturer: "" }];
  const reviews = initialGearReview(lines);
  assert.equal(reviews[0].reviewed, false);
  assert.throws(() => assembleGearReview(lines, reviews, []), /Review the gear match/);
  assert.deepEqual(assembleGearReview(lines, [{ assetIds: [], reviewed: true, suggested: false }], []).gear, lines);
});
test("the Sweetwater purchase and later snake refund leave Ike's net advance at $1,695.65", () => {
  const original = entry(purchase({
    date: "2024-03-25", amountCents: 174503,
    funding: { ike: 174503, chris: 0, company: 0 },
    vendorOrderNumber: "40486367",
  }), "sweetwater");
  const refund = entry(purchase({
    kind: "refund", date: "2024-04-03", amountCents: 4938,
    funding: { ike: 4938, chris: 0, company: 0 },
    relatedEntryId: original.id, gear: [],
  }), "snake-refund");
  assert.equal(totals([original, refund]).ike, 169565);
});
test("rehearsal equalization credits each founder $1,500 without double-counting expense", () => {
  const entries = [
    entry(
      purchase({
        amountCents: 200000,
        funding: { ike: 0, chris: 200000, company: 0 },
      }),
      "chris",
    ),
    entry(purchase(), "ike"),
    entry(
      purchase({
        kind: "transfer",
        amountCents: 50000,
        funding: { ike: 0, chris: 0, company: 0 },
        person: "ike",
      }),
      "transfer",
    ),
  ];
  assert.deepEqual(totals(entries), {
    ike: 150000,
    chris: 150000,
    company: 0,
    spending: 300000,
    income: 0,
    distributions: 0,
  });
  assert.equal(equalization(entries).difference, 0);
});
test("cash deposit followed by company purchase counts owner funding only once", () => {
  const entries = [
    entry(
      purchase({ kind: "deposit", funding: { ike: 0, chris: 0, company: 0 } }),
    ),
    entry(purchase({ funding: { ike: 0, chris: 0, company: 100000 } })),
  ];
  assert.equal(totals(entries).ike, 100000);
  assert.equal(totals(entries).company, 0);
});
test("four cables receive permanent unique codes and unknown lengths remain unknown", () => {
  const assets = makeAssets(
    purchase({ gear: [{ label: "XLR cable", quantity: 4, isCable: true }] }),
    "test",
    ["0001", "0003"],
    0,
  );
  assert.deepEqual(
    assets.map((a) => a.assetTag),
    ["0002", "0004", "0005", "0006"],
  );
  assert.ok(
    assets.every(
      (a) =>
        a.detailsNeeded &&
        a.ownerPartyId === "party-the-swell" &&
        a.moneyEntryId === "test" &&
        a.cableLengthInches === undefined,
    ),
  );
});
test("personal gear on loan creates inventory but no reimbursement", () => {
  const input = purchase({
    kind: "loaned_gear",
    amountCents: 0,
    funding: { ike: 0, chris: 0, company: 0 },
    person: "chris",
    gear: [{ label: "Keyboard", quantity: 1, isCable: false }],
  });
  assert.equal(effectsFor(input).chris, 0);
  assert.equal(makeAssets(input, "loan", [], 0)[0].ownerPartyId, "party-cron");
});
test("split payments must exactly match cents; invalid dates and fabricated quantity fail", () => {
  assert.throws(() =>
    purchase({ funding: { ike: 50000, chris: 49999, company: 0 } }),
  );
  assert.throws(() => purchase({ date: "2026-02-30" }));
  assert.throws(() =>
    purchase({ gear: [{ label: "Cable", quantity: 0, isCable: true }] }),
  );
  assert.equal(parseMoney("1,200.09"), 120009);
  assert.throws(() => parseMoney("12.345"));
});
test("refund to company preserves owner advance; refund to owner reduces it", () => {
  const original = entry(purchase());
  const input = purchase({
    kind: "refund",
    relatedEntryId: "one",
    amountCents: 25000,
    funding: { ike: 0, chris: 0, company: 25000 },
  });
  assertRefund(input, [original]);
  assert.equal(totals([original, entry(input)]).ike, 100000);
  assert.equal(totals([original, entry(input)]).company, 25000);
  assert.throws(() =>
    assertRefund({ ...input, amountCents: 100001 }, [original]),
  );
});
test("distribution waits until outstanding advances are repaid", () => {
  const distribution = purchase({
    kind: "distribution",
    funding: { ike: 0, chris: 0, company: 0 },
  });
  assert.throws(() => assertDistribution(distribution, [entry(purchase())]));
  assert.doesNotThrow(() => assertDistribution(distribution, []));
});
test("equalizing transfer is half the funding gap, with cents handled explicitly", () => {
  const result = equalization([
    entry(
      purchase({
        amountCents: 101,
        funding: { ike: 101, chris: 0, company: 0 },
      }),
    ),
  ]);
  assert.equal(result.from, "chris");
  assert.equal(result.transferCents, 50);
  assert.equal(result.difference, 101);
  assert.equal(result.remainderCents, 1);
});
test("CSV protects against spreadsheet formula injection", () => {
  assert.match(
    csvExport([entry(purchase({ description: '=HYPERLINK("bad")' }))]),
    /"'=HYPERLINK\(""bad""\)"/,
  );
});
test("Telegram requires both configured group and individual identity", () => {
  process.env.TELEGRAM_FINANCE_CHAT_ID = "-100123";
  process.env.TELEGRAM_IKE_USER_ID = "123";
  process.env.TELEGRAM_CHRIS_USER_ID = "456";
  assert.equal(telegramSender(-100123, 123), "ike");
  assert.equal(telegramSender(-100123, 456), "chris");
  assert.equal(telegramSender(-100123, 789), null);
  assert.equal(telegramSender(-100124, 123), null);
  assert.equal(validTelegramSecret("secret", "secret"), true);
  assert.equal(validTelegramSecret("bad", "secret"), false);
  assert.equal(validTelegramSecret(null, undefined), false);
});

test("malformed AI fields never reach the review form", () => {
  const draft = safeDraftInput({
    description: "Known purchase",
    gear: "invented array",
    funding: "bad",
    kind: "delete_database",
  });
  assert.equal(draft.description, "Known purchase");
  assert.equal(draft.gear, undefined);
  assert.equal(draft.kind, undefined);
  assert.equal(draft.funding, undefined);
});

test("legacy category identifiers survive new entries before the first catalog save", async () => {
  const { initialCategories, changeCategories } =
    await import("../../src/lib/money/categories.ts");
  const before = initialCategories(["Stagewear", "Meals"]);
  const after = initialCategories(["Printing", "Meals", "Stagewear"]);
  const target = before.find((c) => c.name === "Stagewear");
  assert.equal(after.find((c) => c.name === "Stagewear").id, target.id);
  assert.ok(
    changeCategories(after, { action: "delete", id: target.id }, "unused").find(
      (c) => c.name === "Stagewear",
    ).deleted,
  );
});

test("band member payments are expenses and owner advances, while venue income adds company cash", () => {
  const band = (overrides = {}) =>
    purchase({
      kind: "band_payment",
      counterparty: "Rehearsal musicians",
      category: "Band payments",
      ...overrides,
    });
  const payments = [
    entry(
      band({
        amountCents: 200000,
        funding: { ike: 0, chris: 200000, company: 0 },
      }),
      "chris-band",
    ),
    entry(band(), "ike-band"),
    entry(
      purchase({
        kind: "transfer",
        amountCents: 50000,
        funding: { ike: 0, chris: 0, company: 0 },
      }),
      "equalize-band",
    ),
  ];
  assert.equal(totals(payments).ike, 150000);
  assert.equal(totals(payments).chris, 150000);
  assert.equal(totals(payments).spending, 300000);
  assert.equal(totals(payments).income, 0);
  assert.equal(equalization(payments).difference, 0);
  const paidByCompany = effectsFor(
    band({ funding: { ike: 0, chris: 0, company: 100000 } }),
  );
  assert.equal(paidByCompany.company, -100000);
  assert.equal(paidByCompany.ike, 0);
  assert.equal(paidByCompany.chris, 0);
  const venueIncome = effectsFor(
    purchase({ kind: "income", funding: { ike: 0, chris: 0, company: 0 } }),
  );
  assert.equal(venueIncome.income, 100000);
  assert.equal(venueIncome.company, 100000);
  assert.deepEqual(makeAssets(band(), "band", [], 0), []);
  assert.throws(() => band({ counterparty: "" }), /who were paid/);
  assert.throws(
    () => band({ funding: { ike: 1, chris: 0, company: 0 } }),
    /payer amounts/,
  );
  assert.throws(
    () => band({ gear: [{ label: "No inventory", quantity: 1 }] }),
    /register inventory/,
  );
});

test("edit validation preserves linked gear, historical categories, and repayment-before-distribution rules", async () => {
  const { prepareMoneyEdit, editableFields } =
    await import("../../src/lib/money/edits.ts");
  const original = entry(purchase({ category: "Deleted category" }), "edit");
  const request = {
    operationId: "edit",
    revision: 0,
    reason: "",
    fields: { ...editableFields(original), date: "2026-09-20" },
  };
  assert.equal(
    prepareMoneyEdit(original, request, [original], []).date,
    "2026-09-20",
  );
  assert.throws(
    () =>
      prepareMoneyEdit(
        original,
        {
          ...request,
          fields: { ...request.fields, category: "Not available" },
        },
        [original],
        [],
      ),
    /available category/,
  );
  const linked = { ...original, assetIds: ["asset-one"], assetTags: ["0001"] };
  assert.throws(
    () =>
      prepareMoneyEdit(
        linked,
        {
          ...request,
          fields: {
            ...request.fields,
            kind: "income",
            funding: { ike: 0, chris: 0, company: 0 },
          },
        },
        [linked],
        [],
      ),
    /linked gear/,
  );
  const existingOrder = entry(purchase({
    description: "Original Sweetwater order",
    counterparty: "Sweetwater",
    vendorOrderNumber: "40486367",
  }), "existing-order");
  assert.throws(
    () => prepareMoneyEdit(original, {
      ...request,
      fields: { ...request.fields, counterparty: "Sweetwater", vendorOrderNumber: "40486367" },
    }, [original, existingOrder], []),
    /vendor order already has a ledger purchase/,
  );
  const repayment = entry(
    purchase({ kind: "repayment", funding: { ike: 0, chris: 0, company: 0 } }),
    "repay",
  );
  const distribution = entry(
    purchase({
      kind: "distribution",
      funding: { ike: 0, chris: 0, company: 0 },
    }),
    "distribution",
  );
  const ledger = [original, repayment, distribution];
  assert.throws(
    () =>
      prepareMoneyEdit(
        original,
        {
          ...request,
          fields: {
            ...request.fields,
            amountCents: 120000,
            funding: { ike: 120000, chris: 0, company: 0 },
          },
        },
        ledger,
        [],
      ),
    /unpaid owner advances/,
  );
  assert.equal(
    prepareMoneyEdit(original, request, ledger, []).date,
    "2026-09-20",
  );
});
