import { moneyErrorResponse, requireMoneyAdmin } from "@/lib/server/money-auth";
import { loadMoneyReceipt } from "@/lib/server/money-receipts";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ receiptId: string }> },
) {
  try {
    await requireMoneyAdmin(request);
    const { receiptId } = await context.params,
      { receipt, data } = await loadMoneyReceipt(receiptId);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": receipt.contentType,
        "Content-Disposition": `inline; filename="${receipt.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
