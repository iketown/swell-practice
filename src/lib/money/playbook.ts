import { z } from "zod";
import type { Person } from "@/lib/money/domain";

const id = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
const title = z.string().trim().min(3).max(100);
const rule = z.string().trim().min(5).max(1200);

export const playbookActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), operationId: id, title, rule }).strict(),
  z.object({ action: z.literal("update"), operationId: id, id, revision: z.number().int().min(1), title, rule }).strict(),
  z.object({ action: z.literal("archive"), operationId: id, id, revision: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("restore"), operationId: id, id, revision: z.number().int().min(1) }).strict(),
]);

export type PlaybookAction = z.infer<typeof playbookActionSchema>;

export interface PlaybookRule {
  id: string;
  title: string;
  rule: string;
  archived: boolean;
  revision: number;
  createdAt: number;
  createdBy: string;
  createdByPerson: Person;
  updatedAt: number;
  updatedBy: string;
  updatedByPerson: Person;
}

export interface PlaybookEdit {
  id: string;
  ruleId: string;
  action: PlaybookAction["action"];
  before: PlaybookRule | null;
  after: PlaybookRule;
  changedAt: number;
  changedBy: string;
  changedByPerson: Person;
  source: "chat" | "form";
  sourceMessageId?: string;
}

export interface PlaybookSnapshot {
  rules: PlaybookRule[];
  edits: PlaybookEdit[];
}

export function explicitPlaybookRequest(text: string) {
  if (text.trim().endsWith("?") && !/\b(remember|save|update|change|set|add|archive|forget)\b/i.test(text))
    return false;
  return /\b(remember|save (?:this|that)|add .{0,40}(?:playbook|policy|rule)|(?:update|change|revise|remove|archive|forget) .{0,40}(?:playbook|policy|rule)|set (?:a|the|our) (?:policy|rule)|(?:our|the) (?:policy|rule) (?:is|will be)|from now on|going forward|we (?:will|always|never))\b/i.test(text);
}
