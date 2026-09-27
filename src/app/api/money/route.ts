import { moneyErrorResponse, requireMoneyAdmin } from "@/lib/server/money-auth";
import { postMoney, readMoney } from "@/lib/server/money-store";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireMoneyAdmin(request);
    return Response.json(await readMoney(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireMoneyAdmin(request);
    const body = z
      .object({
        input: z.unknown(),
        operationId: z.string().max(90),
        draftId: z.string().optional(),
      })
      .parse(await request.json());
    return Response.json(
      await postMoney(body.input, body.operationId, actor, "web", body.draftId),
    );
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
