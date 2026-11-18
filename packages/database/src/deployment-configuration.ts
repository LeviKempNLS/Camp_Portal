type Environment = Record<string, string | undefined>;

const environments = ["development", "test", "demo", "staging", "production"];
const placeholder =
  /placeholder|change[-_ ]?me|replace[-_ ]?me|ci-only|local-synthetic|test-secret/i;

/** Validate configuration without opening a database connection or exposing values. */
export function assertDeploymentConfiguration(env: Environment) {
  const errors: string[] = [];
  if (!["production", "staging"].includes(env.PORTAL_ENVIRONMENT ?? "")) {
    errors.push("PORTAL_ENVIRONMENT must be production or staging");
  }
  if (env.ALLOW_DEMO_DATA && env.ALLOW_DEMO_DATA !== "false") {
    errors.push("ALLOW_DEMO_DATA must be absent or false");
  }
  if (env.DEMO_REGISTRAR_EMAIL) {
    errors.push("DEMO_REGISTRAR_EMAIL must be absent");
  }

  const secret = env.BETTER_AUTH_SECRET ?? "";
  if (
    secret.length < 32 ||
    secret.trim() !== secret ||
    placeholder.test(secret)
  ) {
    errors.push(
      "BETTER_AUTH_SECRET must be a non-placeholder secret of at least 32 characters without surrounding whitespace",
    );
  }

  try {
    const origin = new URL(env.BETTER_AUTH_URL ?? "");
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/" ||
      /^(localhost|127\.|0\.0\.0\.0$|\[::(?:1)?\]$)/i.test(origin.hostname)
    ) {
      throw new Error();
    }
  } catch {
    errors.push(
      "BETTER_AUTH_URL must be a public HTTPS origin without credentials, path, query or fragment",
    );
  }

  try {
    const url = new URL(env.DATABASE_URL ?? "");
    const password = decodeURIComponent(url.password);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !password ||
      url.pathname.length <= 1 ||
      placeholder.test(password) ||
      password === "local_only"
    ) {
      throw new Error();
    }
  } catch {
    errors.push(
      "DATABASE_URL must identify a PostgreSQL database with non-placeholder credentials",
    );
  }

  if (errors.length) {
    throw new Error(`Deployment configuration invalid: ${errors.join("; ")}.`);
  }
}

/** Preserve the unclassified demo startup while guarding declared release environments. */
export function assertRuntimeConfiguration(env: Environment) {
  if (!env.PORTAL_ENVIRONMENT) return;
  if (!environments.includes(env.PORTAL_ENVIRONMENT)) {
    throw new Error(
      "PORTAL_ENVIRONMENT is not a recognized environment classification.",
    );
  }
  if (["production", "staging"].includes(env.PORTAL_ENVIRONMENT)) {
    assertDeploymentConfiguration(env);
  }
}
