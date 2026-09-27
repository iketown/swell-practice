import { requireMoneyAdmin, moneyErrorResponse } from "@/lib/server/money-auth";
import {
  readMoneyCategories,
  updateMoneyCategories,
} from "@/lib/server/money-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireMoneyAdmin(request);
    return Response.json(await readMoneyCategories(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireMoneyAdmin(request);
    return Response.json(
      await updateMoneyCategories(await request.json(), actor),
    );
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
