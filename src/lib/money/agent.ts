import { z } from "zod";
import type { GearChoicePlan, GearLinkProposal } from "@/lib/money/gear-match";

export const agentMessageSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,90}$/),
  text: z.string().trim().max(8000),
  receiptIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).max(4),
  gearChoice: z.object({
    draftId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    kind: z.enum(["new", "existing"]),
    assetIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).max(100).default([]),
  }).strict().optional(),
}).strict().refine((value) => value.text.length > 0 || value.receiptIds.length > 0, {
  message: "Write a message or attach a receipt.",
});

export type AgentMessageRequest = z.infer<typeof agentMessageSchema>;

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actor: string;
  person?: "ike" | "chris";
  receiptIds: string[];
  createdAt: number;
  entryId?: string;
  draftId?: string;
  gearProposal?: GearLinkProposal;
  gearChoices?: GearChoicePlan;
  gearCodes?: string[];
  playbookRuleId?: string;
}
