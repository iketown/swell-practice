// Run from the swell-parts directory. Secrets are read from .env.local, never printed.
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
for (const filename of [".env.local", ".env"]) {
  if (existsSync(filename)) process.loadEnvFile(filename);
}
const command = process.argv[2];
if (command === "secret") {
  console.log(randomBytes(32).toString("hex"));
  process.exit(0);
}
if (!["ids", "setup", "status"].includes(command))
  throw new Error("Use: node tools/money/telegram.mjs ids|setup|status|secret");
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in .env.local first.");
async function call(method, body = {}) {
  // Avoid dumping a fetch error that could contain the token-bearing URL.
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not connect to Telegram.");
  }
  const data = await response.json();
  if (!data.ok)
    throw new Error(`Telegram rejected ${method}. Check the bot settings.`);
  return data.result;
}
if (command === "ids") {
  const status = await call("getWebhookInfo");
  if (status.url)
    throw new Error(
      "A webhook is already active. Do not poll this bot; read its chat/user IDs from its existing configuration.",
    );
  const updates = await call("getUpdates", {
    timeout: 0,
    allowed_updates: ["message"],
  });
  const identities = new Map();
  for (const update of updates) {
    const m = update.message;
    if (m?.from)
      identities.set(`${m.chat.id}:${m.from.id}`, {
        chatId: m.chat.id,
        chatTitle: m.chat.title ?? "Direct chat",
        userId: m.from.id,
        name: [m.from.first_name, m.from.last_name].filter(Boolean).join(" "),
      });
  }
  console.log(JSON.stringify([...identities.values()], null, 2));
  if (!identities.size)
    console.log(
      "Have Ike and Chris each send /start in the new private group, then run this again.",
    );
} else if (command === "status") {
  const status = await call("getWebhookInfo");
  console.log(
    JSON.stringify(
      {
        url: status.url,
        pendingUpdates: status.pending_update_count,
        lastError: status.last_error_message ?? null,
      },
      null,
      2,
    ),
  );
} else {
  for (const key of [
    "MONEY_SITE_URL",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_FINANCE_CHAT_ID",
    "TELEGRAM_IKE_USER_ID",
    "TELEGRAM_CHRIS_USER_ID",
  ])
    if (!process.env[key]) throw new Error(`Set ${key} first.`);
  const url = new URL(process.env.MONEY_SITE_URL);
  if (url.protocol !== "https:")
    throw new Error("MONEY_SITE_URL must use HTTPS.");
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(process.env.TELEGRAM_WEBHOOK_SECRET))
    throw new Error(
      "Use a random webhook secret of 32–256 allowed characters.",
    );
  await call("setWebhook", {
    url: `${url.origin}/api/money/telegram`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  console.log(
    `Webhook connected to ${url.origin}/api/money/telegram. Discovery messages were cleared; send a fresh /balance command in the group.`,
  );
}
