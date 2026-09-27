import { isCableInventoryAsset, type InventoryAsset, type PurchaseOrder } from "@/lib/gear/domain";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
import type { EntryInput } from "@/lib/money/domain";

export interface GearLinkProposal {
  assets: Array<{ id: string; code: string; label: string; model: string }>;
  gearLineIndexes: number[];
  purchaseOrderId: string;
}

export interface GearChoicePlan {
  reviewMode?: "grid";
  lines: Array<{
    lineIndex: number;
    label: string;
    quantity: number;
    candidates: Array<{ id: string; code: string; label: string; model: string }>;
    choice?: { kind: "new" } | { kind: "existing"; assetIds: string[] };
  }>;
  orderId: string;
  orderAssetIds: string[];
}

export type GearChoice = { kind: "new" } | { kind: "existing"; assetIds: string[] };

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const tokens = (value: string) => value.toLowerCase().match(/[a-z0-9]+/g) || [];
const ignored = new Set(["the", "and", "for", "with", "new", "inch", "inches", "foot", "feet", "ft", "xlr", "cable", "cables", "channel", "channels", "rack", "mixer", "snake"]);

function candidateIsCable(asset: InventoryAsset, definition?: EquipmentTemplate) {
  if (definition?.definitionKind === "cable" || asset.cableLengthInches ||
    (asset.tags && isCableInventoryAsset(asset))) return true;
  if (definition?.definitionKind) return false;
  return /\b(cables?|cords?|snakes?)\b/i.test(`${asset.label} ${definition?.name || ""}`);
}

function statedLengthInches(value: string): number | undefined {
  const feet = value.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(ft|feet|foot)\b/);
  if (feet) return Number(feet[1]) * 12;
  const inches = value.toLowerCase().match(/(?<!\/)\b(\d+(?:\.\d+)?)\s*(inches|inch|in)\b/);
  return inches ? Number(inches[1]) : undefined;
}

function isShortXlrAdapter(label: string, asset: InventoryAsset) {
  return /\b(adapters?|converters?)\b/i.test(label) &&
    /\bxlr\b/i.test(label) && /\b(female|f)\b/i.test(label) &&
    /(?:1\s*\/\s*4|6\.35|quarter)/i.test(label) &&
    /\bXLR-F\s*[→-]+\s*(?:TS|TRS)-F\b/i.test(asset.label) &&
    Boolean(asset.cableLengthInches && asset.cableLengthInches <= 12);
}

function candidateScore(label: string, asset: InventoryAsset, definition?: EquipmentTemplate) {
  const name = [asset.label, definition?.name || "", definition?.model || ""].join(" ");
  const requestedLength = statedLengthInches(label);
  const assetLength = asset.cableLengthInches || statedLengthInches(name);
  if (requestedLength && assetLength && Math.abs(requestedLength - assetLength) > 1) return 0;
  if (isShortXlrAdapter(label, asset)) return 60;
  if (sameProduct(label, asset, definition)) return 100;
  const requested = new Set(tokens(label).filter((token) => token.length >= 3 && !ignored.has(token)));
  const known = new Set(tokens(name).filter((token) => token.length >= 3 && !ignored.has(token)));
  const shared = [...requested].filter((token) => known.has(token));
  if (!shared.length && requestedLength && assetLength &&
    Math.abs(requestedLength - assetLength) <= 1 &&
    /\bxlr\b/i.test(label) && /\bxlr\b/i.test(name) &&
    /\bcables?\b/i.test(label)) return 12;
  if (!shared.length) return 0;
  return shared.reduce((score, token) => score + (/\d/.test(token) ? 14 : 7), 0);
}

/** Present candidates; a purchase never links or creates inventory until each line is chosen. */
export function planGearChoices(input: Pick<EntryInput, "kind" | "gear" | "vendorOrderNumber">, assets: InventoryAsset[], definitions: EquipmentTemplate[], orders: PurchaseOrder[]): GearChoicePlan | null {
  if (input.kind !== "purchase" || !input.gear.length) return null;
  const byDefinition = new Map(definitions.map((definition) => [definition.id, definition]));
  const matchingOrders = input.vendorOrderNumber
    ? orders.filter((order) => compact(order.orderNumber || "") === compact(input.vendorOrderNumber))
    : [];
  const order = matchingOrders.length === 1 ? matchingOrders[0] : undefined;
  const orderAssetIds = order?.lines.flatMap((line) => line.assetIds) || [];
  return {
    reviewMode: "grid",
    orderId: order?.id || "",
    orderAssetIds,
    lines: input.gear.map((line, lineIndex) => ({
      lineIndex, label: line.label, quantity: line.quantity,
      candidates: assets.flatMap((asset) => {
        if (asset.moneyEntryId || !/^\d{4}$/.test(asset.assetTag) ||
          (asset.ownerPartyId && asset.ownerPartyId !== "party-the-swell") ||
          ["retired", "cancelled", "planned", "cart"].includes(asset.lifecycleStatus) ||
          (asset.purchaseOrderId && input.vendorOrderNumber && asset.purchaseOrderId !== order?.id) ||
          (orderAssetIds.length && !orderAssetIds.includes(asset.id))) return [];
        const definition = byDefinition.get(asset.definitionId);
        if (candidateIsCable(asset, definition) !== line.isCable &&
          !(isShortXlrAdapter(line.label, asset) && !line.isCable)) return [];
        const score = candidateScore(line.label, asset, definition);
        return score ? [{ score, id: asset.id, code: asset.assetTag, label: asset.label, model: definition?.model || "" }] : [];
      }).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, Math.max(5, Math.min(20, line.quantity)))
        .map(({ id, code, label, model }) => ({ id, code, label, model })),
    })),
  };
}

export function nextGearChoice(plan: GearChoicePlan) {
  return plan.lines.find((line) => !line.choice);
}

export function parseGearChoice(text: string, plan: GearChoicePlan): GearChoice | null {
  const line = nextGearChoice(plan);
  if (!line) return null;
  const answer = text.toLowerCase().trim();
  if (/\b(new (gear|item|record)|create (a )?new|none of (these|them)|not (one of )?these|brand new)\b/.test(answer) || /^(new|none)$/i.test(answer))
    return { kind: "new" };
  const mentioned = line.candidates.filter((candidate) => new RegExp(`\\b${candidate.code}\\b`).test(answer));
  if (mentioned.length === line.quantity && /\b(use|link|existing|code|codes|this|these|yes|that|those)\b/.test(answer))
    return { kind: "existing", assetIds: mentioned.map((candidate) => candidate.id) };
  if (line.quantity === 1 && line.candidates.length === 1 &&
    /^(yes|yep|yeah|correct|that's it|that one|use it|link it)[.! ]*$/.test(answer))
    return { kind: "existing", assetIds: [line.candidates[0].id] };
  return null;
}

export function chooseGear(plan: GearChoicePlan, choice: GearChoice): GearChoicePlan {
  const line = nextGearChoice(plan);
  if (!line) throw new Error("All gear choices are already complete.");
  if (choice.kind === "existing") {
    const allowed = new Set(line.candidates.map((candidate) => candidate.id));
    const previouslyUsed = new Set(plan.lines.flatMap((item) => item.choice?.kind === "existing" ? item.choice.assetIds : []));
    if (choice.assetIds.length !== line.quantity || new Set(choice.assetIds).size !== choice.assetIds.length ||
      choice.assetIds.some((id) => !allowed.has(id) || previouslyUsed.has(id)))
      throw new Error("Choose a listed, unused gear code for each item in this line.");
  }
  return { ...plan, lines: plan.lines.map((item) => item.lineIndex === line.lineIndex
    ? { ...item, choice }
    : choice.kind === "existing" && !item.choice
      ? { ...item, candidates: item.candidates.filter((candidate) => !choice.assetIds.includes(candidate.id)) }
      : item) };
}

export function applyGearChoices(input: EntryInput, plan: GearChoicePlan): EntryInput {
  if (nextGearChoice(plan)) throw new Error("Choose existing or new gear for every purchase line.");
  const linked = plan.lines.flatMap((line) => line.choice?.kind === "existing" ? line.choice.assetIds : []);
  const selected = new Set(linked);
  return {
    ...input,
    gear: input.gear.filter((_, index) => plan.lines.find((line) => line.lineIndex === index)?.choice?.kind !== "existing"),
    existingAssetIds: [...new Set([...input.existingAssetIds, ...linked])],
    purchaseOrderId: plan.orderId && plan.orderAssetIds.length &&
      plan.orderAssetIds.every((id) => selected.has(id)) &&
      linked.every((id) => plan.orderAssetIds.includes(id)) &&
      !plan.lines.some((line) => line.choice?.kind === "new")
      ? plan.orderId : input.purchaseOrderId,
  };
}

function sameProduct(label: string, asset: InventoryAsset, definition?: EquipmentTemplate) {
  const description = compact(label);
  const model = compact(definition?.model || "");
  const assetLabel = compact(asset.label);
  const definitionName = compact(definition?.name || "");
  return Boolean(
    (model.length >= 4 && /\d/.test(model) && description.includes(model)) ||
    (assetLabel.length >= 7 && /\d/.test(assetLabel) && description.includes(assetLabel)) ||
    (definitionName.length >= 7 && /\d/.test(definitionName) && description.includes(definitionName))
  );
}

export function linkedGearConflicts(input: EntryInput, assets: InventoryAsset[], definitions: EquipmentTemplate[]) {
  const byDefinition = new Map(definitions.map((definition) => [definition.id, definition]));
  return assets.filter((asset) => asset.moneyEntryId &&
    input.gear.some((line) => sameProduct(line.label, asset, byDefinition.get(asset.definitionId))))
    .map((asset) => ({ code: asset.assetTag, label: asset.label, entryId: asset.moneyEntryId! }));
}

/** Only exact product-model evidence can propose an existing asset for a purchase. */
export function proposeExistingGear(
  input: EntryInput,
  assets: InventoryAsset[],
  definitions: EquipmentTemplate[],
  orders: PurchaseOrder[],
): GearLinkProposal | null {
  if (input.kind !== "purchase" || !input.gear.length) return null;
  const byDefinition = new Map(definitions.map((definition) => [definition.id, definition]));
  const matchingOrders = input.vendorOrderNumber
    ? orders.filter((order) => compact(order.orderNumber || "") === compact(input.vendorOrderNumber))
    : [];
  const order = matchingOrders.length === 1 ? matchingOrders[0] : undefined;
  const orderAssetIds = new Set(order?.lines.flatMap((line) => line.assetIds) || []);
  const proposed: GearLinkProposal = { assets: [], gearLineIndexes: [], purchaseOrderId: "" };
  const used = new Set<string>();
  input.gear.forEach((line, index) => {
    if (line.quantity !== 1) return;
    const matches = assets.filter((asset) => {
      if (used.has(asset.id) || asset.moneyEntryId || !/^\d{4}$/.test(asset.assetTag)) return false;
      if (asset.ownerPartyId && asset.ownerPartyId !== "party-the-swell") return false;
      if (asset.lifecycleStatus === "retired" || asset.lifecycleStatus === "cancelled") return false;
      if (asset.purchaseOrderId && asset.purchaseOrderId !== order?.id) return false;
      if (orderAssetIds.size && !orderAssetIds.has(asset.id)) return false;
      const definition = byDefinition.get(asset.definitionId);
      return sameProduct(line.label, asset, definition);
    });
    if (matches.length !== 1) return;
    const asset = matches[0], definition = byDefinition.get(asset.definitionId);
    used.add(asset.id);
    proposed.assets.push({ id: asset.id, code: asset.assetTag, label: asset.label, model: definition?.model || "" });
    proposed.gearLineIndexes.push(index);
  });
  if (!proposed.assets.length) return null;
  if (order && (!orderAssetIds.size ||
    (orderAssetIds.size === proposed.assets.length &&
      proposed.assets.every((asset) => orderAssetIds.has(asset.id)))))
    proposed.purchaseOrderId = order.id;
  return proposed;
}

export function applyGearLink(input: EntryInput, proposal: GearLinkProposal): EntryInput {
  const indexes = new Set(proposal.gearLineIndexes);
  return {
    ...input,
    gear: input.gear.filter((_, index) => !indexes.has(index)),
    existingAssetIds: [...new Set([...input.existingAssetIds, ...proposal.assets.map((asset) => asset.id)])],
    purchaseOrderId: proposal.purchaseOrderId || input.purchaseOrderId,
  };
}

export function confirmsGearLink(text: string, proposal: GearLinkProposal) {
  const answer = text.trim().toLowerCase();
  if (/^(no|not|don't|do not|stop|wait)\b/.test(answer)) return false;
  if (/^(yes|yep|yeah|correct|confirmed|confirm|please do|go ahead)[.! ]*$/.test(answer)) return true;
  if (/^(yes|yep|yeah|correct)[\s,!.\-]+(please\s+)?(link|use|that's|that is|do that|go ahead)\b/.test(answer) &&
    !/\b(?:don't|do not|not)\s+(?:link|use)\b/.test(answer)) return true;
  return /\b(link|connect|use)\b/.test(answer) && proposal.assets.every((asset) =>
    new RegExp(`\\b${asset.code}\\b`).test(answer)
  );
}
