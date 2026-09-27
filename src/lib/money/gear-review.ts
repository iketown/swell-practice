import type { EntryInput } from "@/lib/money/domain";
import type { GearChoicePlan } from "@/lib/money/gear-match";

export interface GearLineReview {
  assetIds: string[];
  reviewed: boolean;
  suggested: boolean;
}

/** A suggestion is visible in the form, but must be reviewed before posting. */
export function initialGearReview(lines: EntryInput["gear"], plan?: GearChoicePlan, reservedAssetIds: string[] = []): GearLineReview[] {
  const used = new Set(reservedAssetIds);
  return lines.map((line, index) => {
    const proposal = plan?.lines.find((item) => item.lineIndex === index);
    if (!proposal) return { assetIds: [], reviewed: false, suggested: false };
    if (proposal.choice?.kind === "new") return { assetIds: [], reviewed: true, suggested: false };
    if (proposal.choice?.kind === "existing") {
      const assetIds = proposal.choice.assetIds.filter((id) => !used.has(id));
      assetIds.forEach((id) => used.add(id));
      return { assetIds, reviewed: true, suggested: false };
    }
    const matches = proposal.candidates.filter((asset) => !used.has(asset.id)).slice(0, line.quantity);
    const assetIds = matches.length === line.quantity ? matches.map((asset) => asset.id) : [];
    assetIds.forEach((id) => used.add(id));
    return { assetIds, reviewed: false, suggested: assetIds.length > 0 };
  });
}

export function assembleGearReview(
  lines: EntryInput["gear"],
  reviews: GearLineReview[],
  additionalAssetIds: string[],
) {
  const linked = [...additionalAssetIds];
  const newGear: EntryInput["gear"] = [];
  for (const [index, line] of lines.entries()) {
    const review = reviews[index];
    if (!review?.reviewed) throw new Error(`Review the gear match for item ${index + 1}: ${line.label}.`);
    if (review.assetIds.length > line.quantity)
      throw new Error(`Too many gear records are linked to ${line.label}.`);
    linked.push(...review.assetIds);
    const newQuantity = line.quantity - review.assetIds.length;
    if (newQuantity) newGear.push({ ...line, quantity: newQuantity });
  }
  if (new Set(linked).size !== linked.length)
    throw new Error("A gear record can only be linked to one receipt item.");
  return { gear: newGear, existingAssetIds: linked };
}
