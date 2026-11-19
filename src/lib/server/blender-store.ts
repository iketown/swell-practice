import { createHash } from "node:crypto";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import { applyBlenderChanges, blenderSnapshot, BlenderSyncError, type DefinitionMap, type DefinitionState } from "@/lib/setup-designer/blender-sync";
import { type BlenderPatch } from "@/lib/setup-designer/blender-contract";
import { setupGraphFromData, graphByteSize } from "@/lib/setup-designer/serialization";
import type { SetupGraph } from "@/lib/setup-designer/domain";
import type { requireBlenderSession } from "@/lib/server/blender-auth";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).filter(([, v]) => v !== undefined).map(([k, v]) => [k, canonical(v)]));
  return value;
}
async function readGraph(transaction: Transaction, setupId: string) {
  const db = getServerFirestore(), metadataRef = db.doc(`setups/${setupId}`), graphRef = metadataRef.collection("graphs").doc("current");
  const [metadata, graph] = await transaction.getAll(metadataRef, graphRef);
  if (!metadata.exists || !graph.exists || metadata.data()?.status === "archived") throw new BlenderSyncError("missing_setup", "Setup not found.", 404);
  const result = setupGraphFromData(graph.data());
  if (result.revision !== metadata.data()?.revision) throw new BlenderSyncError("inconsistent_revision", "Setup revisions do not agree. Save it from the website first.");
  return { graph: result, rawGraph: graph.data()!, metadataRef, graphRef };
}
async function readDefinitions(transaction: Transaction, graph: SetupGraph): Promise<DefinitionMap> {
  const ids = [...new Set(graph.nodes.flatMap((node) => node.data.templateId ? [node.data.templateId] : []))];
  if (!ids.length) return {};
  const snapshots = await transaction.getAll(...ids.map((id) => getServerFirestore().doc(`equipmentTemplates/${id}`)));
  return Object.fromEntries(snapshots.filter((item) => item.exists).map((item) => [item.id, item.data() as DefinitionState]));
}
export async function readBlenderSnapshot(setupId: string) {
  return getServerFirestore().runTransaction(async (transaction) => {
    const { graph } = await readGraph(transaction, setupId);
    return blenderSnapshot(setupId, graph, await readDefinitions(transaction, graph));
  }, { readOnly: true });
}
export async function commitBlenderPatch(patch: BlenderPatch, access: Awaited<ReturnType<typeof requireBlenderSession>>) {
  const db = getServerFirestore(), hash = createHash("sha256").update(JSON.stringify(canonical(patch))).digest("hex");
  return db.runTransaction(async (transaction) => {
    const receiptRef = db.doc(`setups/${patch.setupId}/blenderMutations/${patch.mutationId}`);
    const [receipt, session] = await transaction.getAll(receiptRef, access.reference);
    if (session.data()?.revoked || Number(session.data()?.expiresAt ?? 0) <= Date.now()) throw new BlenderSyncError("authentication", "Connection expired or revoked.", 401);
    if (receipt.exists) {
      const data = receipt.data()!;
      if (data.hash !== hash || data.uid !== access.uid || data.clientId !== patch.clientId) throw new BlenderSyncError("mutation_conflict", "Mutation ID was already used for another change.");
      return { ...data.acknowledgement, replayed: true };
    }
    const { graph, rawGraph, metadataRef, graphRef } = await readGraph(transaction, patch.setupId);
    const definitions = await readDefinitions(transaction, graph);
    const result = applyBlenderChanges(graph, patch, definitions, access.allowDefinitions);
    if (graphByteSize(result.graph) >= 1000 * 1024) throw new BlenderSyncError("too_large", "Setup is too large to save.", 413);
    const acknowledgement = { schemaVersion: 1, setupId: patch.setupId, mutationId: patch.mutationId, revision: result.graph.revision, replayed: false,
      changedWaypointIds: (patch.waypointChanges ?? []).map(change => change.waypointId),
      changedNodeIds: patch.changes.map((change) => change.nodeId), correctedDefinitions: result.corrections.flatMap((item) => item.scope === "definition" ? [{ templateId: item.templateId!, version: item.version! }] : []) };
    for (const correction of result.corrections.filter((item) => item.scope === "definition")) {
      const reference = db.doc(`equipmentTemplates/${correction.templateId}`);
      const old = definitions[correction.templateId!].physicalDimensions ?? {};
      const physicalDimensions = { ...old, widthInches: correction.after.widthInches, depthInches: correction.after.depthInches, heightInches: correction.after.heightInches };
      transaction.update(reference, { physicalDimensions, version: correction.version, updatedAt: FieldValue.serverTimestamp() });
      transaction.create(reference.collection("dimensionCorrections").doc(patch.mutationId), { ...correction, before: old, setupId: patch.setupId, uid: access.uid, createdAt: FieldValue.serverTimestamp() });
    }
    transaction.set(graphRef, { ...rawGraph, ...JSON.parse(JSON.stringify(result.graph)), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(metadataRef, { revision: result.graph.revision, updatedAt: FieldValue.serverTimestamp(), updatedBy: access.uid });
    transaction.create(receiptRef, { hash, uid: access.uid, clientId: patch.clientId, acknowledgement, corrections: result.corrections, createdAt: FieldValue.serverTimestamp() });
    return acknowledgement;
  });
}
