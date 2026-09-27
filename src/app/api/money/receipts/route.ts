import {
  moneyErrorResponse,
  MoneyError,
  requireMoneyAdmin,
} from "@/lib/server/money-auth";
import {
  MAX_RECEIPT_BYTES,
  saveMoneyReceipt,
} from "@/lib/server/money-receipts";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const actor = await requireMoneyAdmin(request);
    if (
      Number(request.headers.get("content-length")) >
      MAX_RECEIPT_BYTES + 10000
    )
      throw new MoneyError("Receipt is too large.", 413);
    const form = await request.formData(),
      file = form.get("file");
    if (!(file instanceof File)) throw new MoneyError("Attach a receipt file.");
    return Response.json(
      await saveMoneyReceipt(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        actor,
      ),
    );
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
