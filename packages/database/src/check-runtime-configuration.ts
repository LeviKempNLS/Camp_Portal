import {
  assertDeploymentConfiguration,
  assertRuntimeConfiguration,
} from "./deployment-configuration.ts";

try {
  if (process.argv.includes("--production")) {
    if (process.env.PORTAL_ENVIRONMENT !== "production") {
      throw new Error(
        "Production commands require PORTAL_ENVIRONMENT=production.",
      );
    }
    assertDeploymentConfiguration(process.env);
  } else {
    assertRuntimeConfiguration(process.env);
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Runtime configuration check failed.",
  );
  process.exitCode = 1;
}
