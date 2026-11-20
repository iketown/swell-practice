import "server-only";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getServerFirestore } from "./firebase-admin";
import { ServerRouteError } from "./admin-auth";
import { initialRider } from "@/lib/rider/seed";
import { plotSchema, type Published } from "@/lib/rider/model";
import {
  replaceCopies,
  type RiderRelease,
  type Delivery,
} from "@/lib/rider/releases";
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
const registryDoc = () =>
  currentDoc().collection("publication").doc("registry");
const deliveries = () => currentDoc().collection("deliveries");

function defaultCode(pub: DocumentSnapshot): string | undefined {
  if (!pub.get("releaseNumber")) return undefined;
  return pub.get("releaseCode") ?? "public-" + pub.get("revision");
}

function registryRows(
  registry: DocumentSnapshot,
  pub: DocumentSnapshot,
): RiderRelease[] {
  if (registry.exists) return registry.get("releases");
  const code = defaultCode(pub);
  if (!code) return [];
  // Older installations only recorded the identity of their last public default.
  return [
    {
      code,
      id: pub.get("versionId") ?? standardVersionId,
      name: pub.get("versionName") ?? "Standard setup",
      revision: pub.get("versionRevision") ?? pub.get("revision"),
      date: pub.get("date"),
      legacyPublicRevision: pub.get("revision"),
      replacement: null,
    },
  ];
}

export async function publicReleaseList() {
  return getServerFirestore().runTransaction(
    async (tx) => {
      const [registry, pub] = await tx.getAll(registryDoc(), currentDoc(), {
        fieldMask: [
          "releases",
          "releaseNumber",
          "releaseCode",
          "revision",
          "versionId",
          "versionName",
          "versionRevision",
          "date",
        ],
      });
      return registryRows(registry, pub);
    },
    { readOnly: true },
  );
}

export async function readIssuedRider(
  release: RiderRelease,
): Promise<Published> {
  const saved = snapshot(await revisionDoc(release.id, release.revision).get());
  return {
    ...saved,
    versionId: release.id,
    versionName: release.name,
    versionRevision: release.revision,
    releaseCode: release.code,
    plot: { ...saved.plot, cables: [], cableNodes: [] },
  };
}

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
    releaseCode: defaultCode(doc),
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
      const [pub, list, registry, sent] = await Promise.all([
        tx.get(currentDoc()),
        tx.get(versions()),
        tx.get(registryDoc()),
        tx.get(deliveries().orderBy("date", "desc")),
      ]);
      const rows: VersionSummary[] = list.docs.map((doc) => ({
        id: doc.id,
        name: doc.get("name"),
        date: doc.get("date"),
        revision: doc.get("revision"),
      }));
      return {
        releases: registryRows(registry, pub),
        deliveries: sent.docs.map((doc) => doc.data() as Delivery),
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
  const [version, publicState, registry] = await Promise.all([
    versions().doc(id).get(),
    currentDoc().get(),
    registryDoc().get(),
  ]);
  if (!version.exists) throw missing();
  const rev = revision ?? version.get("revision");
  const record = snapshot(await revisionDoc(id, rev).get());
  return {
    ...record,
    releaseCode: registryRows(registry, publicState).find(
      (r) => r.id === id && r.revision === rev,
    )?.code,
    releaseNumber: publicState.get("releaseNumber") ?? 0,
    versionId: id,
    versionName: version.get("name"),
    versionRevision: rev,
  };
}

export async function changeVersion(action: VersionAction) {
  await ensureRiderVersions();
  if (action.action === "sent") {
    const receipt = deliveries().doc(action.operationId);
    return getServerFirestore().runTransaction(async (tx) => {
      const [registry, pub, existing] = await tx.getAll(
        registryDoc(),
        currentDoc(),
        receipt,
      );
      const { code, date, recipient } = action;
      if (existing.exists) {
        if (
          existing.get("code") !== code ||
          existing.get("recipient") !== recipient ||
          existing.get("date") !== date
        )
          throw new ServerRouteError(
            "This delivery was already recorded with different details.",
            409,
          );
        return { code };
      }
      if (!registryRows(registry, pub).some((row) => row.code === code))
        throw missing();
      tx.create(receipt, { code, date, recipient });
      return { code };
    });
  }
  const version = versions().doc(action.id);
  const source = revisionDoc(action.id, action.revision);
  return getServerFirestore().runTransaction(async (tx) => {
    const head = await tx.get(version);
    if (!head.exists) throw missing();
    const date = today();
    if (action.action === "save") {
      if (action.expectedHead !== undefined && head.get("revision") !== action.expectedHead) throw conflict();
      const releaseNumber =
        (await tx.get(currentDoc())).get("releaseNumber") ?? 0;
      if (
        (releaseNumber || head.get("hasIssuedRider")) &&
        head.get("revision") !== action.revision
      )
        throw conflict();
      const revision = head.get("revision") + 1;
      const record = {
        revision,
        plot: updateEstimatedInputXlr(action.plot),
        date,
      };
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
    const [pub, registry] = await tx.getAll(current, registryDoc());
    const rows = registryRows(registry, pub);
    const existing = rows.find((row) => row.code === action.code);
    if (
      existing &&
      (existing.id !== action.id ||
        existing.revision !== action.revision ||
        existing.replacement)
    )
      throw new ServerRouteError(
        "This code already belongs to an issued rider. Choose another code.",
        409,
      );
    if (
      rows.some(
        (row) =>
          row.id === action.id &&
          row.revision === action.revision &&
          row.code !== action.code,
      )
    )
      throw new ServerRouteError(
        "This saved revision already has a release code. Refresh the library.",
        409,
      );
    const target: RiderRelease = existing ?? {
      code: action.code,
      id: action.id,
      revision: action.revision,
      name: head.get("name"),
      date,
      replacement: null,
    };
    let next: RiderRelease[];
    try {
      next = replaceCopies(
        existing ? rows : [...rows, target],
        target,
        action.replace,
      );
    } catch (error) {
      throw new ServerRouteError((error as Error).message, 409);
    }
    const oldDefault = defaultCode(pub);
    const updateDefault =
      oldDefault !== target.code &&
      (action.makeDefault ||
        (!!oldDefault && action.replace.includes(oldDefault)));
    if (updateDefault && pub.get("revision") !== action.publicRevision)
      throw new ServerRouteError(
        "The public default changed. Refresh and choose again.",
        409,
      );
    if (updateDefault)
      tx.set(current, {
        ...record,
        revision: action.publicRevision + 1,
        releaseNumber: (pub.get("releaseNumber") ?? 0) + 1,
        date,
        releaseCode: target.code,
        versionId: target.id,
        versionName: target.name,
        versionRevision: target.revision,
      });
    if (!head.get("hasIssuedRider"))
      tx.update(version, { hasIssuedRider: true });
    tx.set(registryDoc(), { releases: next });
    return { code: target.code };
  });
}
