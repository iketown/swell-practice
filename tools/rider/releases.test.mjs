import assert from "node:assert/strict";
import test from "node:test";
import {
  checkHref,
  packetFromQuery,
  releaseCode,
  replaceCopies,
  resolveProductionEdition,
} from "../../src/lib/rider/releases.ts";
import { printedUrl } from "../../src/lib/rider/printed-version.ts";

const edition = (code, revision, id = "drive", replacement = null) => ({
  code,
  revision,
  id,
  name: id,
  date: "2026-11-19",
  replacement,
});

test("compatible editions remain approved until selected and chains follow the correct setup", () => {
  const a = edition("a", 1),
    b = edition("b", 2),
    c = edition("c", 3);
  const hawaii = edition("hawaii", 1, "fly");
  const rows = [a, b, c, hawaii];
  assert.deepEqual(replaceCopies(rows, c, []), rows);
  const first = replaceCopies(rows, b, ["a"]);
  const second = replaceCopies(first, c, ["b"]);
  assert.deepEqual(
    second.map((row) => row.replacement),
    ["c", "c", null, null],
  );
  assert.deepEqual(replaceCopies(second, c, ["b"]), second);
  for (const code of ["missing", "hawaii", "c"])
    assert.throws(() => replaceCopies(rows, c, [code]));
  assert.throws(() => replaceCopies(second, second[0], ["b"]));
  assert.throws(() => replaceCopies(rows, a, ["c"]));
});

test("printed codes and recipient survive a scan and unissued drafts have no release identity", () => {
  for (const code of ["11.19.26", "franklin-theatre-2026"])
    assert.equal(releaseCode.parse(code), code);
  for (const bad of ["", ".", "..", "a/b", "a?b"])
    assert.equal(releaseCode.safeParse(bad).success, false);
  for (const packet of ["Full rider", "Backline", "Audio production"]) {
    const url = new URL(printedUrl("franklin", packet));
    assert.equal(url.origin + url.pathname, "https://theswell.live/sp");
    assert.equal(packetFromQuery(url.searchParams.get("packet")), packet);
    assert.equal(url.pathname + url.search, checkHref("franklin", packet));
  }
  assert.equal(
    printedUrl(undefined, "Backline"),
    "https://theswell.live/sp?draft=1",
  );
});

test("every catalogued production download exists as a PDF", async () => {
  const { readFileSync } = await import("node:fs");
  const root = new URL("../../public/production-documents/", import.meta.url);
  const catalog = JSON.parse(readFileSync(new URL("catalog.json", root), "utf8"));
  for (const entry of catalog) {
    for (const file of [...(entry.packet ? [entry.packet] : []), ...entry.documents]) {
      const bytes = readFileSync(new URL(entry.code + "/" + file.file, root));
      assert.equal(bytes.toString("ascii", 0, 5), "%PDF-");
    }
  }
});

test("a scan follows its own setup, while browsing defaults to the latest approved Standard", () => {
  const standard = edition("11.21.26", 111, "standard");
  const hawaii = edition("hawaii-2027", 4, "hawaii");
  const retired = edition("hawaii-2026", 2, "hawaii", hawaii.code);
  const compatible = edition("hawaii-small", 3, "hawaii");
  const rows = [standard, retired, compatible, hawaii];
  assert.equal(resolveProductionEdition(rows).standard, standard);
  assert.equal(resolveProductionEdition(rows, "11.21.2026").target, standard);
  assert.equal(resolveProductionEdition(rows, "unknown").target, undefined);
  assert.equal(resolveProductionEdition(rows, retired.code).target, hawaii);
  assert.equal(resolveProductionEdition(rows, compatible.code).target, compatible);
  assert.equal(resolveProductionEdition([{ ...retired, replacement: standard.code }, standard], retired.code).target, undefined);
});
