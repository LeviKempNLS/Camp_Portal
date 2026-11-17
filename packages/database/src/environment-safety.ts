/** Explicit opt-in for commands that write fictitious fixtures or grant demo roles. */
export function assertDemoDataAllowed(env: Record<string, string | undefined>) {
  const allowed = ["development", "test", "demo"];
  if (
    !allowed.includes(env.PORTAL_ENVIRONMENT ?? "") ||
    env.ALLOW_DEMO_DATA !== "true"
  ) {
    throw new Error(
      "Demo data commands require PORTAL_ENVIRONMENT=development|test|demo and ALLOW_DEMO_DATA=true. Production and unclassified environments are refused.",
    );
  }
}
