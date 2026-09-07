// Pure helpers of the console. Runs with `npm test` (node --test, TypeScript stripped by Node).

import assert from "node:assert/strict";
import { test } from "node:test";
import { toCsv } from "./csv.ts";
import { cellText, splitQualified, sqlIdent, sqlPath } from "./format.ts";
import { parseBigSafe } from "./upstream.ts";

test("sqlPath quotes only what DuckDB needs quoted", () => {
  assert.equal(sqlPath("raw", "nq"), "lake.raw.nq");
  assert.equal(sqlPath("raw.futures", "nq"), "lake.raw.futures.nq");
  assert.equal(sqlPath("raw", "1st"), 'lake.raw."1st"');
  assert.equal(sqlIdent('a"b'), '"a""b"');
});

test("splitQualified splits at the last dot", () => {
  assert.deepEqual(splitQualified("raw.futures.nq"), {
    namespace: "raw.futures",
    table: "nq",
  });
  assert.deepEqual(splitQualified("nq"), { namespace: "", table: "nq" });
});

test("cellText renders nested values as JSON and null as empty", () => {
  assert.equal(cellText(null), "");
  assert.equal(cellText({ a: [1, "x"] }), '{"a":[1,"x"]}');
  assert.equal(cellText(12), "12");
});

test("toCsv escapes quotes, commas, and newlines", () => {
  const csv = toCsv(
    ["a", "b"],
    [
      { a: 'say "hi"', b: "x,y" },
      { a: null, b: "line\nbreak" },
    ],
  );
  assert.equal(csv, 'a,b\r\n"say ""hi""","x,y"\r\n,"line\nbreak"\r\n');
});

test("parseBigSafe keeps 63-bit integers as digit strings", () => {
  const parsed = parseBigSafe(
    '{"snapshot_id": 6702900848439710649, "rows": 3, "price": 1.5, "neg": -9007199254740993}',
  );
  assert.deepEqual(parsed, {
    snapshot_id: "6702900848439710649",
    rows: 3,
    price: 1.5,
    neg: "-9007199254740993",
  });
});
