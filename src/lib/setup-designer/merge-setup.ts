import type { SetupGraph } from "@/lib/setup-designer/domain";
import { reconcileStageAttachments } from "@/lib/setup-designer/stage-attachments";
export interface SetupMergeConflict { path: string; local: unknown; remote: unknown }
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
/** Firestore may reorder object keys. Array order and actual values still matter. */
export function sameSetupValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameSetupValue(value, b[index]));
  }
  if (record(a) && record(b)) {
    // Optional undefined properties are omitted when the graph is serialized.
    const keys = Object.keys(a).filter((key) => a[key] !== undefined);
    const otherKeys = Object.keys(b).filter((key) => b[key] !== undefined);
    return keys.length === otherKeys.length && keys.every((key) => Object.hasOwn(b, key) && sameSetupValue(a[key], b[key]));
  }
  return false;
}
/** Three-way field merge, with identity-aware node/edge arrays. Missing is a deletion. */
export function mergeSetupGraphs(base: SetupGraph, local: SetupGraph, remote: SetupGraph, choices: Record<string, "local" | "remote"> = {}) {
  const conflicts: SetupMergeConflict[] = [];
  function merge(b: unknown, l: unknown, r: unknown, path: string): unknown {
    if (sameSetupValue(l, r) || sameSetupValue(l, b)) return r;
    if (sameSetupValue(r, b)) return l;
    if (record(l) && record(r) && record(b)) {
      return Object.fromEntries([...new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])].map((key) => [key, merge(b[key], l[key], r[key], path ? `${path}.${key}` : key)]).filter(([, v]) => v !== undefined));
    }
    if ([b, l, r].every((v) => Array.isArray(v) && v.every((item) => record(item) && typeof item.id === "string"))) {
      const maps = [b, l, r].map((v) => new Map((v as Array<{ id: string }>).map((item) => [item.id, item])));
      return [...new Set([...maps[2].keys(), ...maps[1].keys(), ...maps[0].keys()])].map((id) => merge(maps[0].get(id), maps[1].get(id), maps[2].get(id), `${path}[${id}]`)).filter((v) => v !== undefined);
    }
    if (!choices[path]) conflicts.push({ path, local: l, remote: r });
    return choices[path] === "local" ? l : r;
  }
  // Camera/viewports are local navigation preferences, not spatial conflicts.
  const result = merge({ ...base, revision: remote.revision, viewport: local.viewport, stage: { ...base.stage, viewport: local.stage.viewport } },
    { ...local, revision: remote.revision }, { ...remote, viewport: local.viewport, stage: { ...remote.stage, viewport: local.stage.viewport } }, "") as SetupGraph;
  if (!conflicts.length) result.nodes = reconcileStageAttachments(remote.nodes, result.nodes, result.stage);
  return { graph: result, conflicts };
}
