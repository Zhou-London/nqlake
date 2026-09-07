import test from "node:test";
import assert from "node:assert/strict";
import { parseLakeJson, toCsv, isSameOrigin } from "./data.mjs";

test("preserves 64-bit identifiers without rounding regular numbers", () => {
  const data = parseLakeJson(
    '{"snapshot_id":9223372036854775807,"row_count":47560719,"rows":[{"order_id":9007199254740993,"price":1.25,"empty":null}]}',
  );
  assert.equal(data.snapshot_id, "9223372036854775807");
  assert.equal(data.rows[0].order_id, "9007199254740993");
  assert.equal(data.row_count, 47560719);
  assert.equal(data.rows[0].price, 1.25);
  assert.equal(data.rows[0].empty, null);
});
test("CSV preserves column order, quotes, line breaks and null cells", () => {
  assert.equal(
    toCsv(["a", "b"], [{ b: 'say "hi",\nnext', a: null }]),
    '"a","b"\r\n"","say ""hi"",\nnext"',
  );
});
test("CSV neutralizes formulas in data and headers", () => {
  assert.equal(
    toCsv(["=header"], [{ "=header": '=HYPERLINK("test")' }]),
    '"\'=header"\r\n"\'=HYPERLINK(""test"")"',
  );
});
test("same-origin checks retain localhost ports and reject foreign origins", () => {
  assert.equal(
    isSameOrigin("http://127.0.0.1:40001", "127.0.0.1:40001", "http:"),
    true,
  );
  assert.equal(
    isSameOrigin("http://localhost:40001", "localhost:40001", "http:"),
    true,
  );
  assert.equal(
    isSameOrigin("http://127.0.0.1:40002", "127.0.0.1:40001", "http:"),
    false,
  );
  assert.equal(
    isSameOrigin("https://untrusted.example", "127.0.0.1:40001", "http:"),
    false,
  );
  assert.equal(isSameOrigin("null", "127.0.0.1:40001", "http:"), false);
});
