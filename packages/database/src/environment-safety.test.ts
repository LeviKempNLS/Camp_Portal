import test from "node:test";
import assert from "node:assert/strict";
import { assertDemoDataAllowed } from "./environment-safety.ts";

test("production and unclassified environments cannot enable fixture writes", () => {
  for (const environment of [
    undefined,
    "",
    "production",
    "staging",
    "prod",
    "Demo",
  ]) {
    assert.throws(() =>
      assertDemoDataAllowed({
        PORTAL_ENVIRONMENT: environment,
        ALLOW_DEMO_DATA: "true",
      }),
    );
  }
});

test("demo opt-in is explicit and independent of Node production compilation", () => {
  for (const environment of ["development", "test", "demo"]) {
    for (const optIn of [undefined, "", "false", "1", "TRUE"]) {
      assert.throws(() =>
        assertDemoDataAllowed({
          PORTAL_ENVIRONMENT: environment,
          ALLOW_DEMO_DATA: optIn,
        }),
      );
    }
    assert.doesNotThrow(() =>
      assertDemoDataAllowed({
        PORTAL_ENVIRONMENT: environment,
        ALLOW_DEMO_DATA: "true",
        NODE_ENV: "production",
      }),
    );
  }
});

test("all demo command entry points reject production before any database command", async () => {
  const { spawnSync } = await import("node:child_process");
  const root = new URL("../../../", import.meta.url);
  const env = {
    ...process.env,
    PORTAL_ENVIRONMENT: "production",
    ALLOW_DEMO_DATA: "true",
    DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/never_connect",
  };
  for (const command of [
    "db:seed",
    "demo:registrar",
    "db:bootstrap:demo",
    "start:demo",
  ]) {
    const result = spawnSync("npm", ["run", command], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 20000,
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, command);
    assert.match(
      output,
      /Production and unclassified environments are refused/,
      command,
    );
    assert.doesNotMatch(
      output,
      /prisma migrate deploy|next start|Can't reach database/,
      command,
    );
  }
});
