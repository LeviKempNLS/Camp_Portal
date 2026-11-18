import test from "node:test";
import assert from "node:assert/strict";
import { assertReleaseBoundaries, readBlueprint } from "./validate.mjs";

const edit = () => structuredClone(readBlueprint());
const app = (blueprint) => blueprint.projects[0].environments[1].services[0];
const variable = (blueprint, key) =>
  app(blueprint).envVars.find((value) => value.key === key);

test("release Blueprint preserves separate app/database boundaries and reviewed release policy", () => {
  assert.doesNotThrow(() => assertReleaseBoundaries(readBlueprint()));
});

test("cross-environment database and auth-origin references are rejected", () => {
  for (const key of ["DATABASE_URL", "BETTER_AUTH_URL"]) {
    const blueprint = edit();
    const source =
      blueprint.projects[0].environments[0].services[0].envVars.find(
        (value) => value.key === key,
      );
    Object.assign(variable(blueprint, key), structuredClone(source));
    assert.throws(() => assertReleaseBoundaries(blueprint));
  }
});

test("copied or hardcoded authentication secrets and enabled demo data are rejected", () => {
  for (const replacement of [
    { key: "BETTER_AUTH_SECRET", value: "synthetic-not-allowed" },
    { key: "BETTER_AUTH_SECRET", fromGroup: "shared-secrets" },
    { key: "ALLOW_DEMO_DATA", value: "true" },
  ]) {
    const blueprint = edit();
    app(blueprint).envVars = app(blueprint).envVars.map((value) =>
      value.key === replacement.key ? replacement : value,
    );
    assert.throws(() => assertReleaseBoundaries(blueprint));
  }
});

test("fixture initialization, bypassed production startup and automatic deployment are rejected", () => {
  for (const override of [
    { preDeployCommand: "npm run db:bootstrap:demo" },
    { startCommand: "npm run start:demo" },
    { startCommand: "npm run start" },
    { autoDeployTrigger: "commit" },
    { healthCheckPath: "" },
    { maintenanceMode: { enabled: false } },
  ]) {
    const blueprint = edit();
    Object.assign(app(blueprint), override);
    assert.throws(() => assertReleaseBoundaries(blueprint));
  }
});

test("public database ingress and unreviewed cost increases are rejected", () => {
  for (const override of [
    { ipAllowList: [{ source: "0.0.0.0/0" }] },
    { plan: "free" },
    { diskSizeGB: 100 },
    { storageAutoscalingEnabled: true },
    { highAvailability: { enabled: true } },
    { readReplicas: [{ name: "unreviewed-replica" }] },
  ]) {
    const blueprint = edit();
    Object.assign(blueprint.projects[0].environments[1].databases[0], override);
    assert.throws(() => assertReleaseBoundaries(blueprint));
  }
});

test("existing demo names and extra unmanaged resources cannot be adopted by the template", () => {
  const blueprint = edit();
  app(blueprint).name = "Camp_Portal";
  assert.throws(() => assertReleaseBoundaries(blueprint));
  const extra = edit();
  extra.services = [structuredClone(app(extra))];
  assert.throws(() => assertReleaseBoundaries(extra));
});
