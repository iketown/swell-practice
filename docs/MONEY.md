# The Swell Money

Money lives at `/money`. It is available to administrators through the main navigation and from Gear. Transactions link to their exact four-digit gear codes; the same inventory items link back to their transaction.

## Everyday use

- **Talk to Ronnie-bot:** on `/money`, send a question or describe a transaction. Drag a receipt photo or PDF from Finder onto the drop zone, or click it to browse; one receipt up to 4 MB can be attached per message. The server identifies Ike or Chris from the signed-in Firebase Auth account; the chat has no speaker selector. Both administrators can see the shared conversation. Ronnie uses the current ledger to answer questions; clear Swell purchases, band member payments, and refunds linked to a recorded purchase can post automatically. She returns a transaction link and gear codes when recorded. Missing details or an AI allowance failure become a review draft with the receipt attached and do not affect balances. For a meal, state clearly that it was for The Swell and give the business purpose. For transfers, repayments, income, distributions and personally loaned gear, review the prepared draft in the Money form before posting. A refund needs its date and a uniquely matching original purchase; Ronnie can find that purchase from a vendor order number. Ronnie never executes a payment. A ChatGPT subscription does not supply the website's API usage; this integration uses the existing `OPEN_ROUTER_API_KEY`.
- **Record transaction:** enter the actual total paid, date, payer, merchant/recipient, and any vendor order number. Rehearsal and video-session payments need no gear lines.
- **New gear:** add a line such as “XLR cable”, quantity 4. Recording the purchase atomically creates one ledger entry and four inventory records with unique codes. Those codes are available immediately. Each item is company-owned and awaiting check-in. Unknown definitions and lengths stay blank, marked **Details needed**.
- **Existing gear:** enter its existing codes instead of adding new gear lines. Reconcile an existing purchase order from **Gear orders to reconcile**; this attaches its existing assets rather than duplicating them. For a chat purchase, Ronnie reads each receipt item and searches eligible unlinked Gear. In a new transaction form, attach the receipt and click **Ask Ronnie to parse receipt**; the same action can re-read a saved draft. Ronnie fills the product rows and proposes existing four-digit codes without recording money or gear. Review every line, use **Not this one** to reject a guess, search Gear by code/name/model, or choose new records; one receipt line can combine linked items with new items. The summary grid shows every link and planned new code before recording. Yellow rows still need a choice; green rows have been accepted, including new gear approved for creation when the transaction is recorded. Suggestions must be reviewed, so the receipt does not post while its matches are unresolved. A different stated cable length is not shown as a match. Search can also find personally owned gear; it explicitly warns that linking it to a purchase will transfer its ownership to The Swell. Gear already linked to a transaction or a different purchase order is excluded. You can create another unit of the same model. The recorded reply links to the transaction and each gear code. If Gear has no order record, the vendor order number can still be stored on the Money transaction. Verify actual amounts, not catalog prices. The reconciliation flow currently records a whole order payment, not installment accounting.
- **Finish details:** open a transaction, select the relevant gear, and apply shared length, brand, name or definition. Individual gear links open the full Gear editor. Codes, ownership and financial amounts are preserved.
- **Loaned personal gear:** choose that transaction type and its personal owner. It creates inventory but no reimbursement balance. Financially linked ownership is protected; correcting ownership requires reversing the mistaken entry and recording its replacement, not quietly changing it in Gear.
- **Transfers:** for “Ike sent Chris $500”, choose Partner equalization, sender Ike, amount $500. Ike's credit increases and Chris's decreases; band spending stays unchanged.
- **Refunds:** select the original purchase and the actual recipient(s). A refund to a founder reduces their outstanding funding; a refund paid into the company account increases company cash without erasing the original founder advance. Total refunds cannot exceed the purchase. The gear remains in inventory; retire returned items in Gear.
- **Repayments:** a payment from the company back to a founder reduces their outstanding balance and company cash. Record income and owner deposits separately. Spending company funds never credits founders again.
- **Corrections:** open the entry and choose **Edit transaction**. Save date, description, category, amount, payer, and other corrections directly; **Change history** shows before/after values, author, time, and optional reason. The same entry keeps its receipts and gear codes. Use **Reverse / cancel this transaction** only to cancel an entry; reverse linked refunds before cancelling their purchase.
- **Export CSV:** exports the currently filtered ledger, with gear codes, signed funding/cash changes and reversal references.

All financial amounts are integer US cents. The ledger is an operational record of approved repayable funding, not a tax capital account or a replacement for bookkeeping. Ownership remains 50/50. Profit distributions are blocked while recorded advances remain positive. Company cash is the balance derived from recorded transactions, not a connected bank feed.

## Receipt handling

Receipt images (JPEG, PNG, WebP) and PDFs are stored privately in Firebase Storage at `money-receipts/{sha256}`. The web upload limit is 4 MB to fit common serverless request limits; Telegram intake accepts up to 8 MB. Receipt metadata lives in `moneyReceipts`. There are no public download tokens. Viewing bytes requires a verified administrator session through `/api/money/receipts/{receiptId}`.

The **Read a receipt** flow sends the supplied receipt and message to the configured OpenRouter model and stores a review draft. It uses the existing `OPEN_ROUTER_API_KEY`; `OPEN_ROUTER_MONEY_MODEL` can override the default `deepseek/deepseek-v4.1-flash`. This is separate from Ronnie's conversation model (`OPEN_ROUTER_MONEY_AGENT_MODEL`). The full transaction reader disables reasoning and caps output at 1,200 tokens; the focused item reader caps output at 1,600 tokens. Both reject providers above $0.40/M input, $1.50/M output tokens, or $0.005 per image. PDFs use OpenRouter's free Cloudflare AI parser; image receipts use the model's vision input. Server logs record the returned model, token counts and cost without receipt contents. The price ceiling also applies to an overridden model, so an expensive override fails rather than silently raising receipt costs. Large or ambiguous receipts may need manual review. If account credits are exhausted, Ronnie retains the uploaded receipt in a review draft without posting. Unknown payer, amount, date, mixed personal/business purchases and multi-order receipts require review. Identical receipt bytes cannot fund two active purchases. A separate fingerprint catches likely duplicate manual transactions; a genuine repeated payment requires an explanation.

## Optional Telegram setup, if wanted later

1. In Telegram, use the official **@BotFather** to create a dedicated bot. Store its token in `.env.local` and the deployed server environment as `TELEGRAM_BOT_TOKEN`. Never paste secrets into a group chat or client-side variables.
2. Create a private group containing Ike, Chris and the bot. In BotFather, disable Group Privacy for this dedicated bot so ordinary text and receipt captions in this finance group arrive. If Telegram requests it, remove and re-add the bot. Keep this bot out of unrelated groups.
3. Before activating its webhook, have Ike and Chris each send `/start` in that group. Run `node tools/money/telegram.mjs ids` locally. This prints only chat and sender identities, not message bodies or the bot token. It refuses polling if the bot already has a webhook. Record the negative group ID as `TELEGRAM_FINANCE_CHAT_ID`, and the two distinct numeric sender IDs as `TELEGRAM_IKE_USER_ID` and `TELEGRAM_CHRIS_USER_ID`.
4. Generate a webhook secret with `node tools/money/telegram.mjs secret`. Save it as `TELEGRAM_WEBHOOK_SECRET` in both local and deployed server settings. Set `MONEY_SITE_URL=https://theswell.live` (or the actual production origin).
5. Deploy the application and the included Firestore/Storage rules, with Firebase Admin credentials and `OPEN_ROUTER_API_KEY` configured. The webhook must run on an always-available HTTPS host, not localhost. Keep `/api/money/telegram` reachable by Telegram; authentication is its secret header plus chat and user allowlists. All website finance endpoints require Firebase administrator authentication and have no demo bypass.
6. Run `node tools/money/telegram.mjs setup`. This points the bot at `/api/money/telegram` and discards the earlier discovery messages. Check `node tools/money/telegram.mjs status`, then send `/balance` in the group.

Typical message: **“Ike bought 4 XLR cables”**, with the receipt attached as one photo or PDF and that text as the caption. The payer named in the message takes precedence over who sent it. “I” refers to the sender. A clear message posts automatically, creates the gear, and replies with the amount, codes, balances and transaction link. It never transfers money.

If clarification is needed, the bot saves a draft without changing balances or inventory. Either partner can reply directly to its question or open the draft on the website. Album uploads wait for review to avoid counting multiple images of one receipt as multiple purchases. For one receipt spread across pages, send one PDF. Edited Telegram messages do not silently rewrite posted financial history; use the transaction's correction workflow.

Webhook updates use durable processing leases and idempotent operation IDs. Repeated deliveries cannot create another purchase or another set of gear codes. A reply delivery failure may cause a repeated bot reply, but not duplicate financial effects. Processing is bounded to a 60-second route; complex receipts may fall back to a draft for manual review.

## Deploy / permissions

Apply both `firestore.rules` and `storage.rules` along with the app release. In particular, `gearCodeRegistry/current` is now used by ordinary Gear creation as well as Money. Deploy the rules **before or with** this code so existing Gear writes can use the shared allocator. Existing signed-in gear read rules are unchanged.

Money entries are written and edited only through the authenticated server API. Browser clients cannot directly create, edit or delete them, even with an admin login. Linked inventory IDs, transaction links and ownership cannot be changed from browser writes, and linked gear cannot be permanently deleted. Retirement preserves its history. The shared code registry retains previously allocated codes.

No live transactions are seeded or imported automatically. The historical reconciliation must be entered and verified against actual receipts and partner transfers. `/money?demo=1` is an isolated browser-local demonstration; its data never reaches the real ledger or Telegram. Demo receipt upload is disabled.

## Verification

Run from the project root:

```sh
node --import ./tools/money/register-test-loader.mjs --test tools/money/ledger.test.mjs
node --import ./tools/money/register-test-loader.mjs --test tools/money/ronnie-gear.test.mjs
firebase emulators:exec --only firestore --project demo-swell-money --config firebase.money.test.json 'FIREBASE_ADMIN_PROJECT_ID=demo-swell-money node --import ./tools/money/register-test-loader.mjs --test tools/money/store.test.mjs'
firebase emulators:exec --only firestore --project demo-swell-money --config firebase.money.test.json 'FIREBASE_ADMIN_PROJECT_ID=demo-swell-money node --import ./tools/money/register-test-loader.mjs --test tools/money/ronnie-gear.store.test.mjs'
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

The database tests refuse any non-emulator project. They verify atomic purchase/gear creation, concurrent allocation, idempotency, duplicates, corrections, refund limits, bulk details, and security rules. Live Telegram delivery and receipt-model accuracy require a configured bot and a real receipt acceptance test after deployment.


## Managing categories

Use **Money → Manage categories** to add, rename, delete, or restore a category. Clothing, Meals, and Band payments are included. You can also select **+ New category** while recording a transaction without losing the details you have entered. Deleted categories disappear from future choices; past transactions keep their original labels after a rename or deletion. The ledger has a category filter, including historical labels.

For clothes, select **Purchase / expense**, select Clothing, enter who paid and the amount, and leave **Track gear (optional)** empty. For payments to musicians, select **Pay band members**, name who was paid, and enter the amount and payer. The payment increases that partner’s amount due without creating inventory or four-digit codes. Receipt intake also treats clothing and band payments as expenses without gear.


## Swell playbook

Open **Swell playbook** on `/money` to review, add, edit, archive, or restore standing company policies and customary musician rates. The panel shows when a rule last changed and a recent before/after history. Ike or Chris can also give Ronnie an explicit instruction to remember or change a rule in chat; she saves it to the same playbook and returns a review link. Attach receipts to transaction messages, not policy-change messages. Ronnie does not treat one-off payments or receipt text as a new standing policy. A playbook rate guides questions and review; the ledger still records the amount actually paid, and changing a rule never changes past transactions.

## Ask Ronnie about Gear and check items in

Ronnie can answer “Where are our mic stands?”, “What gear is at Chris's house?”, “What's in case 1001?”, “When was 0200 last checked in?”, and “What's happening with gear?” She reads the live Gear records and distinguishes a direct check-in from a location inherited through a case. Results are last recorded observations, not live GPS; packing checklist status does not prove an item was verified for the current trip. Item codes in her answer link to their Gear pages. Her maintained system guide explains how Money, Gear, check-ins, containers, packing, and setups relate; new site capabilities should be added to that guide and given a specific tool rather than relying on old chat messages.

To record a clear move, send a message such as **“Hey Ronnie, I just moved 1501, 1502 and 2003 to Chris's house.”** Ronnie resolves the exact codes and the existing location, writes check-in history, updates the items' last-known location, and replies with all moved codes. Connected gear moves together; moving a case also updates the effective location of gear inside it without inventing individual scans. Repeating the same chat message cannot check items in twice. Unknown codes, missing or ambiguous destinations, and stale container locations leave everything unchanged; she asks for a correction. Use the named destination or a container's four-digit code, and send check-in instructions without a receipt. This chat action changes Gear placement only: it does not change ownership, balances, or transactions. The Gear check-in and packing screens remain available for scanning and trip verification.

## Add a receipt to an existing transaction

Open the transaction from the Money ledger, click **Add receipt** in its Receipts section, choose a photo or PDF (up to 4 MB), and click **Save receipt**. The receipt is attached to the same entry; amounts, payer, balances, and inventory stay unchanged. Use **View receipt** to open it later. Each transaction supports up to ten receipts. For an incorrect date, amount, or payer, use **Edit transaction** and **Save changes**.


## Band member payments versus incoming revenue

Choose **Pay band members** for money paid to musicians for a rehearsal, video session, or gig. Enter the member name(s), amount, and whether Ike, Chris, The Swell, or a split paid it. Personal payments increase the payer's amount due; company payments reduce company cash. This type creates no gear records. **Income received (gigs, etc.)** is money coming into The Swell from a venue or client. Use **Company repayment** for returning owner advances and **Profit distribution** for profit payouts.


## Edit an existing transaction

Open an entry and click **Edit transaction**. Correct the fields, optionally explain why, and choose **Save changes**. Balances recalculate without creating another transaction. **Change history** records old and new values for every saved edit. Receipts and four-digit gear codes stay attached. If someone else edits first, use **Reload latest transaction** and reopen the editor; your stale copy will not overwrite their changes. Reversed entries remain closed. A linked gear transaction keeps its type and ownership, and financial edits must remain consistent with existing refunds and distributions.
