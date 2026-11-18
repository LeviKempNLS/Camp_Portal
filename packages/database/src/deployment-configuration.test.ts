import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  assertDeploymentConfiguration,
  assertRuntimeConfiguration,
} from "./deployment-configuration.ts";

const valid = {
  PORTAL_ENVIRONMENT: "production",
  DATABASE_URL:
    "postgresql://portal:fictitious-password@localhost:5432/release_test",
  BETTER_AUTH_SECRET: "verification-only-fictitious-secret-0123456789",
  BETTER_AUTH_URL: "https://portal.example.test",
};

test("release configuration supports staging and production without requiring a payment provider", () => {
  for (const environment of ["production", "staging"]) {
    assert.doesNotThrow(() =>
      assertDeploymentConfiguration({
        ...valid,
        PORTAL_ENVIRONMENT: environment,
      }),
    );
  }
});

test("release environments reject missing configuration, demo settings and known placeholder secrets", () => {
  const invalid = [
    { PORTAL_ENVIRONMENT: undefined },
    { PORTAL_ENVIRONMENT: "demo" },
    { ALLOW_DEMO_DATA: "true" },
    { ALLOW_DEMO_DATA: "1" },
    { DEMO_REGISTRAR_EMAIL: "fictitious@example.test" },
    { BETTER_AUTH_SECRET: undefined },
    { BETTER_AUTH_SECRET: "short" },
    { BETTER_AUTH_SECRET: "change-me-".repeat(6) },
    { BETTER_AUTH_SECRET: " " + valid.BETTER_AUTH_SECRET },
    { DATABASE_URL: undefined },
    { DATABASE_URL: "not-a-url" },
    { DATABASE_URL: "mysql://portal:password@db.example.test/portal" },
    { DATABASE_URL: "postgresql://portal@db.example.test/portal" },
    { DATABASE_URL: "postgresql://portal:placeholder@db.example.test/portal" },
    { DATABASE_URL: "postgresql://portal:local_only@localhost/portal" },
    { DATABASE_URL: "postgresql://portal:password@db.example.test/" },
    { BETTER_AUTH_URL: undefined },
    { BETTER_AUTH_URL: "not-a-url" },
    { BETTER_AUTH_URL: "http://portal.example.test" },
    { BETTER_AUTH_URL: "https://localhost" },
    { BETTER_AUTH_URL: "https://127.0.0.1" },
    { BETTER_AUTH_URL: "https://[::1]" },
    { BETTER_AUTH_URL: "https://0.0.0.0" },
    { BETTER_AUTH_URL: "https://[::]" },
    { BETTER_AUTH_URL: "https://user:password@portal.example.test" },
    { BETTER_AUTH_URL: "https://portal.example.test/sign-in" },
    { BETTER_AUTH_URL: "https://portal.example.test/?query=1" },
    { BETTER_AUTH_URL: "https://portal.example.test/#fragment" },
  ];
  for (const overrides of invalid) {
    assert.throws(() =>
      assertDeploymentConfiguration({ ...valid, ...overrides }),
    );
  }
});

test("standard startup preserves demo compatibility but enforces declared production/staging configuration", () => {
  for (const environment of [undefined, "development", "test", "demo"]) {
    assert.doesNotThrow(() =>
      assertRuntimeConfiguration({ PORTAL_ENVIRONMENT: environment }),
    );
  }
  assert.throws(() =>
    assertRuntimeConfiguration({ PORTAL_ENVIRONMENT: "prod" }),
  );
  for (const environment of ["production", "staging"]) {
    assert.throws(() =>
      assertRuntimeConfiguration({ PORTAL_ENVIRONMENT: environment }),
    );
    assert.doesNotThrow(() =>
      assertRuntimeConfiguration({ ...valid, PORTAL_ENVIRONMENT: environment }),
    );
  }
});

test("startup and release commands stop before starting Next or Prisma and never echo credential values", () => {
  const root = new URL("../../../", import.meta.url);
  const sensitive = "NEVER_ECHO_THIS_SYNTHETIC_VALUE_0123456789";
  const env = {
    ...process.env,
    ...valid,
    DATABASE_URL: `postgresql://portal:${sensitive}@127.0.0.1:1/never_connect`,
    BETTER_AUTH_SECRET: sensitive,
    BETTER_AUTH_URL: "http://portal.example.test",
    ALLOW_DEMO_DATA: "false",
    DEMO_REGISTRAR_EMAIL: "",
  };
  for (const command of ["start", "start:production", "release:check"]) {
    const result = spawnSync("npm", ["run", command], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 20000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    const output = result.stdout + result.stderr;
    assert.match(output, /BETTER_AUTH_URL must be/);
    assert.doesNotMatch(
      output,
      /next start|prisma migrate|Can't reach database/,
    );
    assert.ok(!output.includes(sensitive));
  }

  for (const environment of ["", "demo", "staging"]) {
    const result = spawnSync("npm", ["run", "production:check"], {
      cwd: root,
      env: { ...env, PORTAL_ENVIRONMENT: environment },
      encoding: "utf8",
      timeout: 20000,
    });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout + result.stderr,
      /require PORTAL_ENVIRONMENT=production/,
    );
  }
});
