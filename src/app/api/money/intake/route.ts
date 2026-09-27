import { z } from "zod";
import { moneyErrorResponse, requireMoneyAdmin } from "@/lib/server/money-auth";
import { extractMoney } from "@/lib/server/money-intake";
import { getServerFirestore } from "@/lib/server/firebase-admin";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const actor = await requireMoneyAdmin(request);
    const body = z
      .object({
        text: z.string().max(8000),
        receiptIds: z.array(z.string()).max(4),
      })
      .parse(await request.json());
    const result = await extractMoney(body.text, body.receiptIds);
    const reference = getServerFirestore().collection("moneyDrafts").doc();
    const draft = {
      id: reference.id,
      ...result,
      receiptIds: body.receiptIds,
      text: body.text,
      createdAt: Date.now(),
      createdBy: actor,
      status: "pending",
    };
    await reference.create(draft);
    return Response.json(draft);
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
