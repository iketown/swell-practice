import { moneyErrorResponse, requireMoneyAdmin, requireMoneyFounder } from "@/lib/server/money-auth";
import { readAgentMessages, runMoneyAgent } from "@/lib/server/money-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    await requireMoneyAdmin(request);
    return Response.json({ messages: await readAgentMessages() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { actor, person } = await requireMoneyFounder(request);
    return Response.json(await runMoneyAgent(await request.json(), actor, person), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
