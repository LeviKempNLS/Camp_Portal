import assert from "node:assert/strict";
import test from "node:test";
import { checkDatabaseConnectivity } from "./index.ts";

test("reports a healthy database query without exposing query results", async () => {
  const result = await checkDatabaseConnectivity({ $queryRaw: async () => [{ ok: 1 }] });
  assert.deepEqual(result, { ok: true });
});

test("reports an unavailable database without exposing the error", async () => {
  const result = await checkDatabaseConnectivity({ $queryRaw: async () => { throw new Error("connection refused"); } });
  assert.deepEqual(result, { ok: false });
});
