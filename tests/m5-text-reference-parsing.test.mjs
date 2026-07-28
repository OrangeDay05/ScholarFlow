import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  formatFromExtension,
  MaterialParseError,
  MAX_TEXT_PARSE_BYTES,
  parseTextReferenceMaterial,
} from "../app/lib/material-parsers/text-reference-parsers.ts";

const encode = (value) => new TextEncoder().encode(value);

test("TXT parser preserves paragraph line ranges", () => {
  const result = parseTextReferenceMaterial(encode("第一段\n继续\n\n第二段"), "TXT");
  assert.equal(result.recordCount, 2);
  assert.deepEqual(result.chunks.map((item) => item.location), [
    { lineStart: 1, lineEnd: 2 },
    { lineStart: 4, lineEnd: 4 },
  ]);
});

test("CSV parser preserves rows, fields and quoted newlines", () => {
  const result = parseTextReferenceMaterial(
    encode('id,note\n1,"line one\nline two"\n2,"a, b"\n'),
    "CSV",
  );
  assert.equal(result.recordCount, 2);
  assert.deepEqual(result.chunks[0].location, {
    row: 2,
    lineStart: 2,
    lineEnd: 3,
    fields: ["id", "note"],
  });
  assert.equal(result.chunks[1].metadata.values.note, "a, b");
});

test("BibTeX parser preserves raw records and source locations", () => {
  const result = parseTextReferenceMaterial(
    encode("@article{one,\n title={First}\n}\n@book(two, title=\"Second\")"),
    "BIBTEX",
  );
  assert.equal(result.recordCount, 2);
  assert.deepEqual(result.chunks[0].metadata, { entryType: "article", citationKey: "one" });
  assert.deepEqual(result.chunks[0].location, { lineStart: 1, lineEnd: 3, record: 1 });
  assert.match(result.chunks[1].text, /^@book/u);
});

test("RIS parser preserves repeated tags and record line ranges", () => {
  const result = parseTextReferenceMaterial(
    encode("TY  - JOUR\nAU  - One\nAU  - Two\nTI  - Test\nER  -\n"),
    "RIS",
  );
  assert.equal(result.recordCount, 1);
  assert.deepEqual(result.chunks[0].metadata.AU, ["One", "Two"]);
  assert.deepEqual(result.chunks[0].location, { lineStart: 1, lineEnd: 5, record: 1 });
});

test("parser rejects unsupported formats, invalid UTF-8 and malformed records", () => {
  assert.throws(() => formatFromExtension("pdf"), MaterialParseError);
  assert.throws(() => parseTextReferenceMaterial(Uint8Array.from([0xc3, 0x28]), "TXT"), /UTF-8/u);
  assert.throws(() => parseTextReferenceMaterial(encode('a,b\n1,"open'), "CSV"), /引号/u);
  assert.throws(() => parseTextReferenceMaterial(encode("@article{one,"), "BIBTEX"), /未闭合/u);
  assert.throws(() => parseTextReferenceMaterial(encode("TY  - JOUR\nTI  - Test"), "RIS"), /ER/u);
  assert.throws(() => parseTextReferenceMaterial(new Uint8Array(MAX_TEXT_PARSE_BYTES + 1), "TXT"), /5 MB/u);
});

test("0009 is additive and allows repeated parse runs for one immutable object", async () => {
  const migration = await readFile(new URL("../drizzle/0009_greedy_jazinda.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `material_parse_runs`/u);
  assert.match(migration, /CREATE TABLE `material_chunks`/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|ALTER TABLE/iu);
  assert.doesNotMatch(migration, /UNIQUE\(`material_id`,\s*`content_hash`\)/iu);
});

test("0000 through 0009 replay into a fresh 68-table database", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (let index = 0; index <= 9; index += 1) {
    const files = [
      "0000_swift_blue_shield.sql", "0001_vengeful_tigra.sql", "0002_petite_sir_ram.sql",
      "0003_condemned_magik.sql", "0004_nervous_maddog.sql", "0005_freezing_nextwave.sql",
      "0006_hot_professor_monster.sql", "0007_silky_power_man.sql", "0008_common_swordsman.sql",
      "0009_greedy_jazinda.sql",
    ];
    database.exec((await readFile(new URL(`../drizzle/${files[index]}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  }
  const count = database.prepare("SELECT count(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get();
  assert.equal(count.total, 68);
});

test("parse route and repository keep object keys server-side and preserve failures", async () => {
  const route = await readFile(new URL("../app/api/m5/projects/[projectId]/materials/[materialId]/parse/route.ts", import.meta.url), "utf8");
  const repository = await readFile(new URL("../db/repositories/m5-material-parsing.ts", import.meta.url), "utf8");
  assert.match(route, /requireM4Actor/u);
  assert.match(repository, /owner_user_id = \?/u);
  assert.match(repository, /status = 'FAILED'/u);
  assert.match(repository, /DELETE FROM material_chunks/u);
  assert.doesNotMatch(route, /objectKey/u);
  assert.doesNotMatch(route, /OCR|pdf|docx|xlsx/iu);
});
