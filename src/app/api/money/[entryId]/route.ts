import { editMoney } from "@/lib/server/money-edits";
import { moneyErrorResponse, requireMoneyAdmin } from "@/lib/server/money-auth";
import {
  attachMoneyReceipt,
  reverseMoney,
  updateMoneyGear,
} from "@/lib/server/money-store";
import { z } from "zod";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  try {
    const actor = await requireMoneyAdmin(request),
      { entryId } = await context.params;
    const body = z
      .object({
        action: z.enum(["reverse", "gear", "receipt", "edit"]),
        receiptId: z.string().min(1).max(128).optional(),
        reason: z.string().optional(),
        details: z.unknown().optional(),
      })
      .parse(await request.json());
    if (body.action === "edit")
      return Response.json(await editMoney(entryId, body.details, actor));
    if (body.action === "receipt")
      return Response.json(
        await attachMoneyReceipt(entryId, body.receiptId ?? "", actor),
      );
    if (body.action === "reverse")
      return Response.json(
        await reverseMoney(entryId, body.reason ?? "", actor),
      );
    await updateMoneyGear(entryId, body.details, actor);
    return Response.json({ ok: true });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
