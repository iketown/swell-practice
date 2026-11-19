import { z } from "zod";
import { plotSchema } from "./model";

export const standardVersionId = "standard";
export const versionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const revisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const ref = { id: versionIdSchema, revision: revisionSchema };
export const versionAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("duplicate"),
    ...ref,
    newId: z.uuid(),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({ action: z.literal("save"), ...ref, plot: plotSchema }),
  z.object({
    action: z.literal("publish"),
    ...ref,
    publicRevision: revisionSchema,
  }),
]);
export type VersionAction = z.infer<typeof versionAction>;
export type VersionSummary = {
  id: string;
  name: string;
  revision: number;
  date: string;
};
export type RevisionSummary = Pick<VersionSummary, "revision" | "date">;
export type DefaultVersion = {
  releaseNumber: number;
  id: string;
  revision: number;
  publicRevision: number;
};
export type VersionList = {
  versions: VersionSummary[];
  current: DefaultVersion;
};
export function versionHref(id: string, revision?: number) {
  const query = new URLSearchParams({ version: id });
  if (revision !== undefined) query.set("revision", String(revision));
  return "/stage-plot/list?" + query;
}
