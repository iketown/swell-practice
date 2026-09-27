import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import {
  money,
  PEOPLE,
  totals,
  type EntryInput,
  type MoneyEntry,
} from "@/lib/money/domain";
import { MoneyError } from "@/lib/server/money-auth";
import { extractMoney } from "@/lib/server/money-intake";
import {
  MAX_RECEIPT_BYTES,
  saveMoneyReceipt,
} from "@/lib/server/money-receipts";
import { postMoney, readMoney } from "@/lib/server/money-store";

const messageSchema = z.object({
  message_id: z.number().int(),
  chat: z.object({ id: z.number().int() }),
  from: z
    .object({ id: z.number().int(), is_bot: z.boolean().optional() })
    .optional(),
  text: z.string().max(8000).optional(),
  caption: z.string().max(8000).optional(),
  photo: z
    .array(z.object({ file_id: z.string(), file_size: z.number().optional() }))
    .optional(),
  document: z
    .object({
      file_id: z.string(),
      file_name: z.string().optional(),
      file_size: z.number().optional(),
    })
    .optional(),
  media_group_id: z.string().optional(),
  reply_to_message: z.object({ message_id: z.number().int() }).optional(),
});
const updateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
});
export function validTelegramSecret(
  supplied: string | null,
  expected: string | undefined,
) {
  if (!supplied || !expected) return false;
  const a = Buffer.from(supplied),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function telegramSender(
  chat: number,
  user: number | undefined,
): "ike" | "chris" | null {
  if (
    String(chat) !== process.env.TELEGRAM_FINANCE_CHAT_ID ||
    user === undefined
  )
    return null;
  if (String(user) === process.env.TELEGRAM_IKE_USER_ID) return "ike";
  if (String(user) === process.env.TELEGRAM_CHRIS_USER_ID) return "chris";
  return null;
}
function site() {
  const url = new URL(process.env.MONEY_SITE_URL ?? "");
  if (url.protocol !== "https:" || url.username || url.password)
    throw new MoneyError("Set MONEY_SITE_URL to the site's HTTPS origin.", 503);
  return url.origin;
}
async function telegram(method: string, body: unknown) {
  if (!process.env.TELEGRAM_BOT_TOKEN)
    throw new MoneyError("Telegram is not configured.", 503);
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok)
    throw new MoneyError(
      "Telegram delivery failed. The saved transaction is safe; delivery will retry.",
      502,
    );
  const data = await response.json();
  if (!data.ok)
    throw new MoneyError("Telegram did not accept the response.", 502);
  return data.result;
}
export async function handleTelegram(raw: unknown) {
  const update = updateSchema.parse(raw),
    message = update.message;
  if (!message || message.from?.is_bot) return;
  const sender = telegramSender(message.chat.id, message.from?.id);
  if (!sender) return;
  const db = getServerFirestore(),
    jobRef = db.doc(`moneyTelegramUpdates/${update.update_id}`);
  const lease = await db.runTransaction(async (tx) => {
    const job = await tx.get(jobRef);
    if (job.data()?.done) return false;
    if (Number(job.data()?.leaseUntil ?? 0) > Date.now())
      throw new MoneyError("This message is still processing.", 503);
    tx.set(
      jobRef,
      {
        leaseUntil: Date.now() + 90_000,
        createdAt: job.data()?.createdAt ?? Date.now(),
      },
      { merge: true },
    );
    return true;
  });
  if (!lease) return;
  try {
    const job = (await jobRef.get()).data()!;
    let reply = typeof job.reply === "string" ? job.reply : "",
      draftId = typeof job.draftId === "string" ? job.draftId : "";
    if (!reply) {
      const text = message.text ?? message.caption ?? "";
      if (
        /^(\/balance(?:@\w+)?|balance|where do we stand\??|what(?:'s| is) (?:our |the )?balance\??)$/i.test(
          text.trim(),
        )
      ) {
        const balance = totals((await readMoney()).entries);
        reply = `Outstanding advances\nIke: ${money(balance.ike)}\nChris: ${money(balance.chris)}\nRecorded company cash: ${money(balance.company)}\n${site()}/money`;
      } else if (/^\/(start|help)(@\w+)?$/i.test(text.trim())) {
        reply = `Send a receipt with a message such as “Ike bought 4 XLR cables.” Clear purchases are recorded automatically and get four-digit gear codes immediately. Reply to a question to clarify, or finish details on the website. Use /balance for balances.\n${site()}/money`;
      } else {
        const draftRef = db.doc(
          `moneyDrafts/tg-${message.chat.id}-${message.message_id}`,
        );
        draftId = draftRef.id;
        const previousReply = message.reply_to_message
          ? await db
              .doc(
                `moneyTelegramReplies/${message.chat.id}-${message.reply_to_message.message_id}`,
              )
              .get()
          : null;
        const parentId =
          previousReply?.data()?.draftId ||
          (message.reply_to_message
            ? `tg-${message.chat.id}-${message.reply_to_message.message_id}`
            : "");
        const parent = parentId
          ? await db.doc(`moneyDrafts/${parentId}`).get()
          : null;
        if (parent?.data()?.status === "posted") {
          reply = `That transaction is already recorded. Make corrections on its page so the audit trail stays intact:\n${site()}/money/${parent.data()?.entryId}`;
        } else {
          const already = await draftRef.get();
          if (already.data()?.status === "posted")
            reply = `Recorded. Review the purchase and gear:\n${site()}/money/${already.data()?.entryId}`;
          else {
            const parentData =
              parent?.data()?.status === "pending" ? parent.data() : null;
            const combinedText = parentData
              ? `${parentData.text}\nClarification from ${PEOPLE[sender]}: ${text}`
              : text;
            const receiptIds: string[] = [...(parentData?.receiptIds ?? [])];
            const file = message.document ?? message.photo?.at(-1);
            if (
              !file &&
              !parentData &&
              !/\b(bought|paid|sent|spent|purchase|reimburse|refund|deposit|loan|lent|income|received|payment|receipt|expense)\b/i.test(
                text,
              )
            ) {
              await jobRef.set({ done: true, leaseUntil: 0 }, { merge: true });
              return;
            }
            let result: {
              input: Partial<EntryInput> | null;
              questions: string[];
              ready: boolean;
            };
            try {
              if (file) {
                if ((file.file_size ?? 0) > MAX_RECEIPT_BYTES)
                  throw new MoneyError(
                    "Please send a receipt smaller than 8 MB.",
                  );
                const info = await telegram("getFile", {
                  file_id: file.file_id,
                });
                if (!info.file_path || info.file_size > MAX_RECEIPT_BYTES)
                  throw new MoneyError(
                    "The receipt could not be downloaded or is too large.",
                  );
                const response = await fetch(
                  `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.file_path}`,
                  { signal: AbortSignal.timeout(12_000) },
                );
                if (!response.ok)
                  throw new MoneyError(
                    "Could not download the receipt. Attach it again on the website.",
                  );
                const receipt = await saveMoneyReceipt(
                  Buffer.from(await response.arrayBuffer()),
                  message.document?.file_name ?? "receipt.jpg",
                  `telegram:${message.from!.id}`,
                );
                if (!receiptIds.includes(receipt.id))
                  receiptIds.push(receipt.id);
              }
              result = await extractMoney(
                combinedText,
                receiptIds,
                parentData?.sender ?? sender,
              );
              if (message.media_group_id) {
                result.ready = false;
                result.questions.push(
                  "This is part of a receipt album. Review the individual images together on the website before posting to avoid counting an order twice.",
                );
              }
            } catch (error) {
              result = {
                input: null,
                questions: [
                  error instanceof MoneyError
                    ? error.message
                    : "Could not read this receipt. Review the entry on the website.",
                ],
                ready: false,
              };
            }
            // Keep drafts durable even if interpretation or automatic posting fails.
            await draftRef.set(
              {
                id: draftId,
                text: combinedText,
                receiptIds,
                input: result.input,
                questions: result.questions,
                status: "pending",
                createdAt: Date.now(),
                createdBy: `telegram:${message.from!.id}`,
                sender: parentData?.sender ?? sender,
              },
              { merge: true },
            );
            let entry: MoneyEntry | undefined;
            if (result.ready) {
              try {
                entry = await postMoney(
                  result.input,
                  `tg-${message.chat.id}-${message.message_id}`,
                  `telegram:${message.from!.id}`,
                  "telegram",
                  draftId,
                );
              } catch (error) {
                if (!(error instanceof MoneyError)) throw error;
                result.questions.push(error.message);
                await draftRef.update({ questions: result.questions });
              }
            }
            if (parentData)
              await parent!.ref.update({
                status: entry ? "posted" : "dismissed",
                ...(entry ? { entryId: entry.id } : {}),
                continuedBy: draftId,
              });
            if (entry) {
              const balance = totals((await readMoney()).entries);
              reply = `Recorded: ${entry.description}\n${money(entry.amountCents)}${entry.assetTags.length ? `\nGear codes: ${entry.assetTags.join(", ")}` : ""}\nDue to Ike: ${money(balance.ike)}\nDue to Chris: ${money(balance.chris)}\nReview and finish gear details:\n${site()}/money/${entry.id}`;
            } else
              reply = `Needs a little more detail; nothing has been added to the ledger yet.\n${result.questions.slice(0, 4).join("\n")}\nReply to this message or review here:\n${site()}/money?draft=${draftId}`;
          }
        }
      }
      await jobRef.set({ reply, draftId }, { merge: true });
    }
    const sent = await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: reply.slice(0, 4000),
      reply_parameters: { message_id: message.message_id },
      link_preview_options: { is_disabled: true },
    });
    if (draftId)
      await db
        .doc(`moneyTelegramReplies/${message.chat.id}-${sent.message_id}`)
        .set({ draftId });
    await jobRef.set({ done: true, leaseUntil: 0 }, { merge: true });
  } catch (error) {
    await jobRef.set({ leaseUntil: 0 }, { merge: true });
    throw error;
  }
}
