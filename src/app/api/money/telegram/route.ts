import {
  handleTelegram,
  validTelegramSecret,
} from "@/lib/server/money-telegram";
import { moneyErrorResponse } from "@/lib/server/money-auth";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (
    !validTelegramSecret(
      request.headers.get("x-telegram-bot-api-secret-token"),
      process.env.TELEGRAM_WEBHOOK_SECRET,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await handleTelegram(await request.json());
    return Response.json({ ok: true });
  } catch (error) {
    return moneyErrorResponse(error);
  }
}
