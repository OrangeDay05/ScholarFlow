import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import test from "node:test";
import { parseXlsx, registerImageAsset } from "../app/lib/material-parsers/spreadsheet-image-parsers.ts";

test("XLSX parser preserves sheet, row, cells and does not execute formulas", () => {
  const xlsx = zipSync({
    "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Data" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8('<sst><si><t>Name</t></si><si><t>Alice</t></si></sst>'),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><f>1+1</f><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>'),
  });
  const result = parseXlsx(xlsx);
  assert.equal(result.recordCount, 2);
  assert.deepEqual(result.chunks[0].location, { sheet: "Data", row: 1, cells: ["A1", "B1"] });
  assert.equal(result.chunks[0].metadata.values.A1, "Name");
  assert.equal(result.chunks[0].metadata.formulas.B1, "1+1");
  assert.equal(result.chunks[0].metadata.formulasExecuted, false);
});

test("PNG is registered as an asset with dimensions and no image understanding", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  const view = new DataView(png.buffer);
  view.setUint32(16, 640);
  view.setUint32(20, 480);
  const result = registerImageAsset(png, "png");
  assert.deepEqual(result.chunks[0].metadata, { extension: "png", width: 640, height: 480, imageUnderstanding: false });
});

test("JPEG is registered as an asset with dimensions and no image understanding", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00]);
  const result = registerImageAsset(jpeg, "jpg");
  assert.equal(result.chunks[0].metadata.width, 600);
  assert.equal(result.chunks[0].metadata.height, 300);
  assert.equal(result.chunks[0].metadata.imageUnderstanding, false);
});

test("XLSX parser rejects invalid containers and image parser rejects invalid headers", () => {
  assert.throws(() => parseXlsx(zipSync({ "data.txt": strToU8("x") })), /XLSX/u);
  assert.throws(() => registerImageAsset(strToU8("not an image"), "png"), /PNG/u);
});
