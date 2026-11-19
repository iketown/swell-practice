import "server-only";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getServerFirestore } from "./firebase-admin";
import { ServerRouteError } from "./admin-auth";
import { initialRider } from "@/lib/rider/seed";
import { plotSchema, type Published } from "@/lib/rider/model";
import { updateEstimatedInputXlr } from "@/lib/rider/input-xlr";
import {
  standardVersionId,
  type VersionAction,
  type VersionList,
  type VersionSummary,
  type RevisionSummary,
} from "@/lib/rider/versions";

const currentDoc = () => getServerFirestore().doc("stageRiders/current");
const versions = () => currentDoc().collection("versions");
const revisionDoc = (id: string, revision: number) =>
  versions().doc(id).collection("revisions").doc(String(revision));
const today = () => new Date().toISOString().slice(0, 10);
const missing = () =>
  new ServerRouteError(
    "This rider version or revision could not be found.",
    404,
  );
const conflict = () =>
  new ServerRouteError(
    "A newer revision has been saved. Reload the latest revision before saving again.",
    409,
  );

function snapshot(snap: DocumentSnapshot): Published {
  if (!snap.exists) throw missing();
  return {
    revision: snap.get("revision"),
    date: snap.get("date"),
    plot: plotSchema.parse(snap.get("plot")),
  };
}

export async function readRider(internal = false): Promise<Published> {
  const doc = await currentDoc().get();
  const record = doc.exists ? snapshot(doc) : initialRider();
  return {
    ...record,
    releaseNumber: doc.get("releaseNumber") ?? 0,
    versionId: doc.get("versionId") ?? standardVersionId,
    versionName: doc.get("versionName") ?? "Standard setup",
    versionRevision: doc.get("versionRevision") ?? record.revision,
    plot: internal
      ? record.plot
      : { ...record.plot, cables: [], cableNodes: [] },
  };
}

// Capture the existing published document, including its private cable map, once.
export async function ensureRiderVersions() {
  const current = currentDoc();
  if ((await current.get()).get("versionId")) return;
  await getServerFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(current);
    if (snap.get("versionId")) return;
    const record = snap.exists ? snapshot(snap) : initialRider();
    const id = standardVersionId,
      name = "Standard setup";
    if (record.revision > 0) tx.create(revisionDoc(id, 0), initialRider());
    tx.create(revisionDoc(id, record.revision), record);
    tx.create(versions().doc(id), {
      name,
      revision: record.revision,
      date: record.date,
    });
    tx.set(
      current,
      {
        ...record,
        versionId: id,
        versionName: name,
        versionRevision: record.revision,
      },
      { merge: true },
    );
  });
}

export async function listVersions(): Promise<VersionList> {
  await ensureRiderVersions();
  return getServerFirestore().runTransaction(
    async (tx) => {
      const [pub, list] = await Promise.all([
        tx.get(currentDoc()),
        tx.get(versions()),
      ]);
      const rows: VersionSummary[] = list.docs.map((doc) => ({
        id: doc.id,
        name: doc.get("name"),
        date: doc.get("date"),
        revision: doc.get("revision"),
      }));
      return {
        versions: rows.sort(
          (a, b) =>
            b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
        ),
        current: {
          id: pub.get("versionId"),
          revision: pub.get("versionRevision"),
          publicRevision: pub.get("revision"),
          releaseNumber: pub.get("releaseNumber") ?? 0,
        },
      };
    },
    { readOnly: true },
  );
}

export async function listRevisions(id: string): Promise<RevisionSummary[]> {
  await ensureRiderVersions();
  const snaps = await versions()
    .doc(id)
    .collection("revisions")
    .orderBy("revision", "desc")
    .select("revision", "date")
    .get();
  if (snaps.empty) throw missing();
  return snaps.docs.map((d) => ({
    revision: d.get("revision"),
    date: d.get("date"),
  }));
}

export async function readVersion(
  id: string,
  revision?: number,
): Promise<Published> {
  await ensureRiderVersions();
  const [version, publicState] = await Promise.all([
    versions().doc(id).get(),
    currentDoc().get(),
  ]);
  if (!version.exists) throw missing();
  const rev = revision ?? version.get("revision");
  const record = snapshot(await revisionDoc(id, rev).get());
  return {
    ...record,
    releaseNumber: publicState.get("releaseNumber") ?? 0,
    versionId: id,
    versionName: version.get("name"),
    versionRevision: rev,
  };
}

export async function changeVersion(action: VersionAction) {
  await ensureRiderVersions();
  const version = versions().doc(action.id);
  const source = revisionDoc(action.id, action.revision);
  return getServerFirestore().runTransaction(async (tx) => {
    const head = await tx.get(version);
    if (!head.exists) throw missing();
    const date = today();
    if (action.action === "save") {
      const releaseNumber =
        (await tx.get(currentDoc())).get("releaseNumber") ?? 0;
      if (releaseNumber && head.get("revision") !== action.revision)
        throw conflict();
      const revision = head.get("revision") + 1;
      const record = { revision, plot: updateEstimatedInputXlr(action.plot), date };
      tx.create(revisionDoc(action.id, revision), record);
      tx.update(version, { revision, date });
      return {
        ...record,
        releaseNumber,
        versionId: action.id,
        versionName: head.get("name"),
        versionRevision: revision,
      };
    }
    const record = snapshot(await tx.get(source));
    if (action.action === "duplicate") {
      const copy = versions().doc(action.newId);
      const existing = await tx.get(copy);
      if (existing.exists) {
        if (
          existing.get("sourceId") !== action.id ||
          existing.get("sourceRevision") !== action.revision ||
          existing.get("name") !== action.name
        )
          throw conflict();
      } else {
        tx.create(copy, {
          name: action.name,
          date,
          revision: 1,
          sourceId: action.id,
          sourceRevision: action.revision,
        });
        tx.create(revisionDoc(copy.id, 1), {
          revision: 1,
          date,
          plot: record.plot,
        });
      }
      return { id: copy.id };
    }
    const current = currentDoc();
    const pub = await tx.get(current);
    const released = pub.get("releaseNumber") ?? 0;
    if (
      released > 0 &&
      pub.get("versionId") === action.id &&
      pub.get("versionRevision") === action.revision
    )
      return { publicRevision: pub.get("revision") as number };
    if (pub.get("revision") !== action.publicRevision) {
      throw new ServerRouteError(
        "The public default changed. Refresh the version list and choose again.",
        409,
      );
    }
    const publicRevision = action.publicRevision + 1;
    tx.set(current, {
      ...record,
      revision: publicRevision,
      releaseNumber: released + 1,
      date,
      versionId: action.id,
      versionName: head.get("name"),
      versionRevision: action.revision,
    });
    return { publicRevision };
  });
}
