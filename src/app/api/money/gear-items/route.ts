import { z } from "zod";
import { MoneyError, moneyErrorResponse, requireMoneyAdmin, validMoneyId } from "@/lib/server/money-auth";
import { extractReceiptGearItems, isServerGearLookupQuestion } from "@/lib/server/money-intake";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import { planGearChoices } from "@/lib/money/gear-match";
import type { MoneyDraft } from "@/lib/money/domain";
import type { InventoryAsset, PurchaseOrder } from "@/lib/gear/domain";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const actor = await requireMoneyAdmin(request);
    const input = z.union([
      z.object({ draftId: z.string() }).strict(),
      z.object({
        receiptIds: z.array(z.string()).min(1).max(4),
        text: z.string().max(8000),
        vendorOrderNumber: z.string().max(100),
      }).strict(),
    ]).parse(await request.json());
    const db = getServerFirestore();
    const ref = "draftId" in input ? db.doc(`moneyDrafts/${validMoneyId(input.draftId)}`) : undefined;
    const previous = ref ? await ref.get() : undefined;
    const draft = previous?.data() as MoneyDraft | undefined;
    if (ref && (!draft || draft.status !== "pending" || draft.input?.kind !== "purchase" || !draft.receiptIds.length))
      throw new MoneyError("This pending purchase draft has no attached receipt to read.", 409);
    const receiptIds = draft?.receiptIds ?? ("receiptIds" in input ? input.receiptIds : []);
    const text = draft?.text ?? ("text" in input ? input.text : "");
    const vendorOrderNumber = draft?.input?.vendorOrderNumber ?? ("vendorOrderNumber" in input ? input.vendorOrderNumber : "");
    const gear = await extractReceiptGearItems(text, receiptIds);
    const [assets, definitions, orders] = await Promise.all([
      db.collection("inventoryAssets").get(),
      db.collection("equipmentTemplates").get(),
      db.collection("purchaseOrders").get(),
    ]);
    const gearChoices = planGearChoices(
      { kind: "purchase", gear, vendorOrderNumber },
      assets.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as InventoryAsset),
      definitions.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as EquipmentTemplate),
      orders.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as PurchaseOrder),
    );
    if (ref) {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        const data = current.data() as MoneyDraft | undefined;
        if (!data || data.status !== "pending" || data.input?.kind !== "purchase")
          throw new MoneyError("This draft changed while the receipt was being read. Reload Money.", 409);
        tx.update(ref, {
          input: { ...data.input, gear },
          gearChoices,
          questions: [...data.questions.filter((question) =>
            !isServerGearLookupQuestion(question) && !/receipt item list is empty|describe the gear item/i.test(question)),
            "Review each receipt item and its gear match before recording."],
          gearExtractedAt: Date.now(),
          gearExtractedBy: actor,
        });
      });
    }
    return Response.json({ gear, gearChoices });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
