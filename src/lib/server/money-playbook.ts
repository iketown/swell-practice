import { createHash, randomUUID } from "node:crypto";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import { MoneyError } from "@/lib/server/money-auth";
import { explicitPlaybookRequest, playbookActionSchema, type PlaybookAction, type PlaybookEdit, type PlaybookRule, type PlaybookSnapshot } from "@/lib/money/playbook";
import type { Person } from "@/lib/money/domain";

const MAX_ACTIVE_RULES = 80;
const MAX_TOTAL_RULES = 250;
const playbookRef = () => getServerFirestore().doc("moneySettings/playbook");

export async function readPlaybook(): Promise<PlaybookRule[]> {
  const snapshot = await playbookRef().get();
  return (snapshot.data()?.rules || []) as PlaybookRule[];
}

export function relevantPlaybookRules(text: string, rules: PlaybookRule[]) {
  const topics = [
    ["meal", "dinner", "lunch", "breakfast", "restaurant", "food"],
    ["rehearsal", "practice"],
    ["video", "film", "filming", "shoot"],
    ["gig", "show", "venue", "performance"],
    ["travel", "hotel", "gas", "mileage"],
  ];
  const words = new Set((text.toLowerCase().match(/[a-z]{3,}/g) || [])
    .filter((word) => !["the", "and", "for", "this", "that", "from", "with", "paid", "receipt", "swell"].includes(word)));
  for (const group of topics) if (group.some((word) => words.has(word))) group.forEach((word) => words.add(word));
  return rules.filter((item) => !item.archived)
    .map((item) => {
      const title = item.title.toLowerCase(), body = item.rule.toLowerCase();
      const score = [...words].reduce((sum, word) => sum + (title.includes(word) ? 3 : 0) + (body.includes(word) ? 1 : 0), 0);
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)
    .slice(0, 12)
    .map(({ item }) => ({ title: item.title, rule: item.rule }));
}

export async function readPlaybookSnapshot(): Promise<PlaybookSnapshot> {
  const db = getServerFirestore();
  const [rules, edits] = await Promise.all([
    readPlaybook(),
    db.collection("moneyPlaybookEdits").orderBy("changedAt", "desc").limit(100).get(),
  ]);
  return { rules, edits: edits.docs.map((doc) => doc.data() as PlaybookEdit) };
}

export async function updatePlaybook(
  raw: unknown,
  actor: string,
  person: Person,
  source: "chat" | "form",
  sourceMessageId?: string,
): Promise<PlaybookRule> {
  const action: PlaybookAction = playbookActionSchema.parse(raw);
  const db = getServerFirestore();
  const ref = playbookRef();
  const editRef = db.doc(`moneyPlaybookEdits/${action.operationId}`);
  const newId = randomUUID();
  return db.runTransaction(async (tx) => {
    const [snapshot, previousEdit] = await Promise.all([tx.get(ref), tx.get(editRef)]);
    if (previousEdit.exists) {
      const prior = previousEdit.data() as PlaybookEdit;
      if (prior.changedBy !== actor || prior.action !== action.action)
        throw new MoneyError("This playbook operation ID was already used.", 409);
      return prior.after;
    }
    const rules = (snapshot.data()?.rules || []) as PlaybookRule[];
    const now = Date.now();
    let before: PlaybookRule | null = null;
    let after: PlaybookRule;
    if (action.action === "create") {
      if (rules.filter((item) => !item.archived).length >= MAX_ACTIVE_RULES)
        throw new MoneyError("The active playbook is full. Archive or consolidate an existing rule.", 409);
      if (rules.length >= MAX_TOTAL_RULES)
        throw new MoneyError("The playbook has reached its total rule limit.", 409);
      if (rules.some((item) => !item.archived && item.title.toLowerCase() === action.title.toLowerCase()))
        throw new MoneyError("A playbook rule already uses that title. Edit it instead.", 409);
      after = {
        id: newId, title: action.title, rule: action.rule, archived: false, revision: 1,
        createdAt: now, createdBy: actor, createdByPerson: person,
        updatedAt: now, updatedBy: actor, updatedByPerson: person,
      };
      rules.push(after);
    } else {
      const index = rules.findIndex((item) => item.id === action.id);
      if (index < 0) throw new MoneyError("That playbook rule no longer exists. Refresh and try again.", 404);
      before = rules[index];
      if (before.revision !== action.revision)
        throw new MoneyError("This rule changed since you opened it. Refresh before editing.", 409);
      if (action.action === "update" && rules.some((item) => item.id !== before!.id && !item.archived && item.title.toLowerCase() === action.title.toLowerCase()))
        throw new MoneyError("Another active rule already uses that title.", 409);
      if (action.action === "restore" && rules.some((item) => item.id !== before!.id && !item.archived && item.title.toLowerCase() === before!.title.toLowerCase()))
        throw new MoneyError("Another active rule already uses that title. Rename it before restoring this rule.", 409);
      if (action.action === "restore" && rules.filter((item) => !item.archived).length >= MAX_ACTIVE_RULES)
        throw new MoneyError("The active playbook is full. Archive or consolidate a rule before restoring this one.", 409);
      after = {
        ...before,
        ...(action.action === "update" ? { title: action.title, rule: action.rule } : {}),
        ...(action.action === "archive" ? { archived: true } : {}),
        ...(action.action === "restore" ? { archived: false } : {}),
        revision: before.revision + 1,
        updatedAt: now, updatedBy: actor, updatedByPerson: person,
      };
      if (after.title === before.title && after.rule === before.rule && after.archived === before.archived)
        return before;
      rules[index] = after;
    }
    const edit: PlaybookEdit = {
      id: action.operationId, ruleId: after.id, action: action.action, before, after,
      changedAt: now, changedBy: actor, changedByPerson: person, source,
      ...(sourceMessageId ? { sourceMessageId } : {}),
    };
    tx.set(ref, { rules, updatedAt: now, updatedBy: actor });
    tx.create(editRef, edit);
    return after;
  });
}

export async function updatePlaybookFromChat(args: {
  action: "save" | "archive";
  title: string;
  rule?: string;
  id?: string;
  sourceQuote: string;
}, context: { text: string; receiptIds: string[]; messageId: string; actor: string; person: Person }) {
  if (context.receiptIds.length || !explicitPlaybookRequest(context.text) ||
    args.sourceQuote.trim().length < 15 || !context.text.toLowerCase().includes(args.sourceQuote.trim().toLowerCase()))
    throw new MoneyError("I can save a playbook rule only from a clear instruction in your current message, without an attached receipt.", 400);
  const rules = await readPlaybook();
  const existing = args.id
    ? rules.find((item) => item.id === args.id)
    : rules.find((item) => !item.archived && item.title.toLowerCase() === args.title.trim().toLowerCase());
  if (args.action === "archive" && (!existing || existing.archived))
    throw new MoneyError("Find the active playbook rule to archive first.", 404);
  if (args.action === "save" && !args.rule?.trim())
    throw new MoneyError("The rule needs a clear statement before I can save it.");
  const operationId = createHash("sha256").update(`${context.messageId}:${args.action}:${args.title.toLowerCase()}`).digest("hex").slice(0, 40);
  const action: PlaybookAction = args.action === "archive"
    ? { action: "archive", id: existing!.id, revision: existing!.revision, operationId }
    : existing
      ? { action: "update", id: existing.id, revision: existing.revision, title: args.title, rule: args.rule!, operationId }
      : { action: "create", title: args.title, rule: args.rule!, operationId };
  return updatePlaybook(action, context.actor, context.person, "chat", context.messageId);
}
