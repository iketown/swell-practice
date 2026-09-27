import { moneyErrorResponse, requireMoneyAdmin, requireMoneyFounder } from "@/lib/server/money-auth";
import { readPlaybookSnapshot, updatePlaybook } from "@/lib/server/money-playbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireMoneyAdmin(request);
    return Response.json(await readPlaybookSnapshot(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { actor, person } = await requireMoneyFounder(request);
    return Response.json(await updatePlaybook(await request.json(), actor, person, "form"), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
