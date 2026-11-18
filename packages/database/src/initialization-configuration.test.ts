import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readInitializationConfiguration } from "./initialization-configuration.ts";
import {
  REFERENCE_ROLES,
  REFERENCE_PERMISSIONS,
  ROLE_PERMISSION_KEYS,
} from "./reference-data.ts";

const configuration = {
  PORTAL_ENVIRONMENT: "production",
  DATABASE_URL:
    "postgresql://operator:fictitious-only@127.0.0.1:1/never_connect",
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  BETTER_AUTH_URL: "https://portal.example.test",
  ALLOW_DEMO_DATA: "false",
  DEMO_REGISTRAR_EMAIL: "",
  CAMP_ORGANIZATION_SLUG: "test-camp",
  CAMP_ORGANIZATION_NAME: "Fictitious Test Camp",
  CAMP_TIMEZONE: "America/Chicago",
  PROVISIONING_REFERENCE: "test-change-19",
  ALLOW_REFERENCE_DATA_INITIALIZATION: "true",
  ALLOW_INITIAL_ADMIN_PROVISIONING: "true",
  INITIAL_ADMIN_USER_ID: "specific-existing-user",
  INITIAL_ADMIN_EMAIL: "Operator@Example.Test",
};

test("reference definitions have unique keys and every role mapping uses existing permissions", () => {
  const roles = new Set(REFERENCE_ROLES.map(([key]) => key)),
    permissions = new Set(REFERENCE_PERMISSIONS.map(([key]) => key));
  assert.equal(roles.size, 7);
  assert.equal(permissions.size, 16);
  for (const [role, keys] of Object.entries(ROLE_PERMISSION_KEYS)) {
    assert(roles.has(role as (typeof REFERENCE_ROLES)[number][0]));
    for (const key of keys) assert(permissions.has(key));
    assert.equal(new Set(keys).size, keys.length);
  }
});

test("release initialization parses explicit configuration without opening a database", () => {
  assert.equal(
    readInitializationConfiguration(configuration, "reference").input
      .environment,
    "production",
  );
  const administrator = readInitializationConfiguration(
    { ...configuration, PORTAL_ENVIRONMENT: "staging" },
    "administrator",
  );
  assert.equal(administrator.mode, "administrator");
  assert.equal(administrator.input.email, "operator@example.test");
});

test("missing consent, demo environments, invalid camp metadata and ambiguous administrator selectors are rejected", () => {
  for (const override of [
    { PORTAL_ENVIRONMENT: "demo" },
    { PORTAL_ENVIRONMENT: "" },
    { ALLOW_DEMO_DATA: "true" },
    { DEMO_REGISTRAR_EMAIL: "demo@example.test" },
    { CAMP_ORGANIZATION_SLUG: "camp-demo" },
    { CAMP_ORGANIZATION_SLUG: "" },
    { PROVISIONING_REFERENCE: "" },
    { PROVISIONING_REFERENCE: "change\nsecret" },
  ]) {
    for (const mode of ["reference", "administrator"] as const)
      assert.throws(() =>
        readInitializationConfiguration(
          { ...configuration, ...override },
          mode,
        ),
      );
  }
  for (const override of [
    { ALLOW_REFERENCE_DATA_INITIALIZATION: "" },
    { CAMP_ORGANIZATION_NAME: "" },
    { CAMP_TIMEZONE: "invalid/zone" },
  ]) {
    assert.throws(() =>
      readInitializationConfiguration(
        { ...configuration, ...override },
        "reference",
      ),
    );
  }
  for (const override of [
    { ALLOW_INITIAL_ADMIN_PROVISIONING: "" },
    { INITIAL_ADMIN_USER_ID: "" },
    { INITIAL_ADMIN_EMAIL: "not-email" },
  ]) {
    assert.throws(() =>
      readInitializationConfiguration(
        { ...configuration, ...override },
        "administrator",
      ),
    );
  }
});

test("private command opt-ins fail before importing Prisma and never echo supplied secrets or identities", () => {
  const root = new URL("../../../", import.meta.url);
  const sentinel = "NEVER_LOG_SYNTHETIC_OPERATOR_DETAILS";
  for (const [command, flag] of [
    ["db:init:reference", "ALLOW_REFERENCE_DATA_INITIALIZATION"],
    ["admin:provision:initial", "ALLOW_INITIAL_ADMIN_PROVISIONING"],
  ]) {
    const result = spawnSync("npm", ["run", command], {
      cwd: root,
      env: {
        ...process.env,
        ...configuration,
        [flag]: "false",
        INITIAL_ADMIN_EMAIL: `${sentinel}@example.test`,
      },
      encoding: "utf8",
      timeout: 20000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    const output = result.stdout + result.stderr;
    assert(output.includes(flag));
    assert(!output.includes(sentinel));
    assert(!output.includes("fictitious-only"));
    assert(!output.includes("Can't reach database"));
  }
});
