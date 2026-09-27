import {
  moneyErrorResponse,
  requireMoneyAdmin,
  validMoneyId,
} from "@/lib/server/money-auth";
import { getServerFirestore } from "@/lib/server/firebase-admin";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  try {
    const actor = await requireMoneyAdmin(request),
      { draftId } = await context.params;
    const ref = getServerFirestore().doc(
      `moneyDrafts/${validMoneyId(draftId)}`,
    );
    await getServerFirestore().runTransaction(async (tx) => {
      const draft = await tx.get(ref);
      if (draft.data()?.status === "pending")
        tx.update(ref, {
          status: "dismissed",
          resolvedBy: actor,
          resolvedAt: Date.now(),
        });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
