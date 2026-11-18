import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const blueprintPath = new URL("./environments.yaml", import.meta.url);
export const schemaUrl = "https://render.com/schema/render.yaml.json";
export function readBlueprint() {
  return parse(readFileSync(blueprintPath, "utf8"), { uniqueKeys: true });
}

/** Enforce the resource boundaries and reviewed minimum-cost release policy. */
export function assertReleaseBoundaries(blueprint) {
  assert.equal(
    blueprint.previews?.generation,
    "off",
    "Blueprint previews must be off",
  );
  assert.equal(
    blueprint.services,
    undefined,
    "No root services may adopt the existing demo",
  );
  assert.equal(
    blueprint.databases,
    undefined,
    "No root databases may adopt the existing demo",
  );
  assert.equal(
    blueprint.envVarGroups,
    undefined,
    "Do not share environment groups between releases",
  );
  assert.equal(
    blueprint.ungrouped,
    undefined,
    "No unreviewed ungrouped resources",
  );
  assert.equal(
    blueprint.projects?.length,
    1,
    "Expected one new release project",
  );
  const environments = blueprint.projects[0].environments;
  assert.deepEqual(environments.map((env) => env.name).sort(), [
    "production",
    "staging",
  ]);
  const names = new Set();
  for (const env of environments) {
    assert.equal(
      env.permissions?.protection,
      "enabled",
      "Release environments must be protected",
    );
    assert.equal(env.services?.length, 1, "Expected one app per environment");
    assert.equal(
      env.databases?.length,
      1,
      "Expected one database per environment",
    );
    assert.equal(
      env.envVarGroups,
      undefined,
      "Release secrets must not come from shared groups",
    );
    const app = env.services[0],
      db = env.databases[0];
    assert.equal(
      app.name,
      `fac-portal-${env.name}`,
      "Only new app names are allowed",
    );
    assert.equal(
      db.name,
      `fac-portal-${env.name}-db`,
      "Only new database names are allowed",
    );
    for (const resource of [app, db]) {
      assert(!names.has(resource.name), "Resource names must be unique");
      names.add(resource.name);
      assert.equal(
        resource.region,
        "ohio",
        "App and database must use the reviewed region",
      );
    }
    assert.equal(app.type, "web");
    assert.equal(app.runtime, "node");
    assert.equal(app.repo, "https://github.com/LeviKempNLS/Camp_Portal");
    assert.equal(app.branch, "main");
    assert.equal(
      app.plan,
      "0.5c-512mb",
      "Compute increases require a new cost review",
    );
    assert.equal(
      app.numInstances,
      1,
      "Instance increases require a new cost review",
    );
    assert.equal(app.scaling, undefined, "Unreviewed autoscaling is disabled");
    assert.equal(
      app.disk,
      undefined,
      "The app stores data in PostgreSQL, not an attached disk",
    );
    assert.equal(
      app.previews,
      undefined,
      "Independent service previews must stay off",
    );
    assert.equal(
      app.autoDeployTrigger,
      "off",
      "Releases require explicit deployment after verification",
    );
    assert.equal(app.healthCheckPath, "/api/health");
    assert.deepEqual(
      app.maintenanceMode,
      { enabled: env.name === "production" },
      "Production public traffic stays closed until launch approval",
    );
    assert.equal(app.buildCommand, "npm ci && npm run build");
    assert.equal(
      app.startCommand,
      env.name === "production" ? "npm run start:production" : "npm run start",
    );
    assert.equal(
      app.preDeployCommand,
      env.name === "production"
        ? "npm run production:check && npm run db:migrate:deploy && npm run release:check"
        : "npm run runtime:check && npm run db:migrate:deploy && npm run db:migrate:status",
    );
    const variables = new Map(
      app.envVars.map((variable) => [variable.key, variable]),
    );
    assert.equal(
      variables.size,
      app.envVars.length,
      "Environment keys must be unique",
    );
    assert.deepEqual(
      [...variables.keys()].sort(),
      [
        "ALLOW_DEMO_DATA",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "DATABASE_URL",
        "NODE_VERSION",
        "PORTAL_ENVIRONMENT",
      ].sort(),
    );
    assert.deepEqual(variables.get("NODE_VERSION"), {
      key: "NODE_VERSION",
      value: "22",
    });
    assert.deepEqual(variables.get("PORTAL_ENVIRONMENT"), {
      key: "PORTAL_ENVIRONMENT",
      value: env.name,
    });
    assert.deepEqual(variables.get("ALLOW_DEMO_DATA"), {
      key: "ALLOW_DEMO_DATA",
      value: "false",
    });
    assert.deepEqual(
      variables.get("DATABASE_URL"),
      {
        key: "DATABASE_URL",
        fromDatabase: { name: db.name, property: "connectionString" },
      },
      "Each app must reference only its own database",
    );
    assert.deepEqual(
      variables.get("BETTER_AUTH_SECRET"),
      { key: "BETTER_AUTH_SECRET", generateValue: true },
      "Generate independent app secrets; never copy or hardcode them",
    );
    assert.deepEqual(
      variables.get("BETTER_AUTH_URL"),
      {
        key: "BETTER_AUTH_URL",
        fromService: {
          type: "web",
          name: app.name,
          envVarKey: "RENDER_EXTERNAL_URL",
        },
      },
      "Each app must use its own assigned public origin",
    );
    assert.equal(
      db.plan,
      "0.1c-256mb",
      "Database compute changes require a new cost review",
    );
    assert.equal(
      db.diskSizeGB,
      5,
      "Storage increases require a new cost review",
    );
    assert.equal(
      db.storageAutoscalingEnabled,
      false,
      "Automatic storage billing increases are disabled",
    );
    assert.equal(
      db.highAvailability,
      undefined,
      "HA requires a separate compute and cost review",
    );
    assert.equal(
      db.readReplicas,
      undefined,
      "Replicas require a separate cost review",
    );
    assert.equal(
      db.connectionPool,
      undefined,
      "Connection pooling must be reviewed separately",
    );
    assert.equal(db.postgresMajorVersion, "17");
    assert.equal(db.databaseName, `fac_${env.name}`);
    assert.equal(db.user, `fac_${env.name}`);
    assert.deepEqual(
      db.ipAllowList,
      [],
      "Database public ingress must be closed",
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const blueprint = readBlueprint();
    const schema = JSON.parse(
      execFileSync(
        "curl",
        [
          "--fail",
          "--silent",
          "--show-error",
          "--location",
          "--max-time",
          "45",
          "--retry",
          "2",
          schemaUrl,
        ],
        { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
      ),
    );
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(blueprint)) {
      console.error(
        validate.errors
          .map((error) => `${error.instancePath}: ${error.message}`)
          .join("\n"),
      );
      process.exitCode = 1;
    } else {
      assertReleaseBoundaries(blueprint);
      console.log(
        "Render schema and release boundaries validated: two apps and two databases with public ingress disabled. No resources created or changed.",
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
