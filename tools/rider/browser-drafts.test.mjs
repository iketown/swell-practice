import test from "node:test";
import assert from "node:assert/strict";
import { draftKey, restoreBrowserDraft, olderBrowserDrafts, clearBrowserDraft } from "../../src/lib/rider/browser-drafts.ts";
import { initialRider } from "../../src/lib/rider/seed.ts";

function memoryStorage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key: (i) => [...entries.keys()][i] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}

const record = { ...initialRider(), revision: 98, versionId: "standard" };
const old = JSON.stringify({ ...record, revision: 97, plot: { ...record.plot, configuration: "Unsaved local edit" } });
const current = JSON.stringify({ ...record, plot: { ...record.plot, configuration: "Current local edit" } });

test("an older Chrome draft stays recoverable when a new revision opens, is edited, or is saved", () => {
  for (const oldKey of ["swell-stage-plot:draft:admin", "swell-stage-plot:draft:admin:standard", draftKey("admin", "standard", 97)]) {
    const storage = memoryStorage();
    storage.setItem(oldKey, old);
    assert.equal(restoreBrowserDraft(storage, record, "admin"), record);
    storage.setItem(draftKey("admin", "standard", 98), current);
    assert.equal(restoreBrowserDraft(storage, record, "admin").plot.configuration, "Current local edit");
    clearBrowserDraft(storage, record, "admin");
    assert.equal(restoreBrowserDraft(storage, record, "admin"), record);
    assert.deepEqual(olderBrowserDrafts(storage, record, "admin"), [{revision:97, raw:old}]);
    assert.deepEqual(olderBrowserDrafts(storage, record, "other-admin"), []);
    assert.deepEqual(olderBrowserDrafts(storage, {...record,versionId:"venue"}, "admin"), []);
  }
});

test("matching legacy drafts still reopen and clear after saving", () => {
  const storage = memoryStorage();
  storage.setItem("swell-stage-plot:draft:admin:standard", current);
  assert.equal(restoreBrowserDraft(storage, record, "admin").plot.configuration, "Current local edit");
  clearBrowserDraft(storage, record, "admin");
  assert.equal(storage.length, 0);
});
