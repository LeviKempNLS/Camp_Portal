import { assertDeploymentConfiguration } from "./deployment-configuration.ts";

export class InitializationError extends Error {}
export type InitializationContext = {
  environment: "production" | "staging";
  organizationSlug: string;
  operatorReference: string;
};
export type ReferenceInitializationInput = InitializationContext & {
  organizationName: string;
  timezone: string;
};
export type InitialAdministratorInput = InitializationContext & {
  userId: string;
  email: string;
};

function required(value: string | undefined, key: string, max = 120) {
  if (
    !value ||
    value !== value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new InitializationError(
      `${key} must be explicitly supplied without surrounding whitespace or control characters.`,
    );
  }
  return value;
}

export function validateInitializationContext(input: InitializationContext) {
  if (!["production", "staging"].includes(input.environment))
    throw new InitializationError(
      "Initialization requires a production or staging environment.",
    );
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      required(input.organizationSlug, "CAMP_ORGANIZATION_SLUG", 80),
    ) ||
    input.organizationSlug.endsWith("-demo")
  ) {
    throw new InitializationError(
      "CAMP_ORGANIZATION_SLUG must be a non-demo lowercase slug.",
    );
  }
  required(input.operatorReference, "PROVISIONING_REFERENCE");
}

export function validateReferenceInput(input: ReferenceInitializationInput) {
  validateInitializationContext(input);
  required(input.organizationName, "CAMP_ORGANIZATION_NAME");
  required(input.timezone, "CAMP_TIMEZONE");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    throw new InitializationError("CAMP_TIMEZONE must be a valid timezone.");
  }
}

export function validateInitialAdministratorInput(
  input: InitialAdministratorInput,
) {
  validateInitializationContext(input);
  required(input.userId, "INITIAL_ADMIN_USER_ID");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      required(input.email, "INITIAL_ADMIN_EMAIL", 254),
    )
  ) {
    throw new InitializationError(
      "INITIAL_ADMIN_EMAIL must be a valid email address.",
    );
  }
}

export function readInitializationConfiguration(
  env: Record<string, string | undefined>,
  mode: "reference" | "administrator",
) {
  try {
    assertDeploymentConfiguration(env);
  } catch (error) {
    throw new InitializationError(
      error instanceof Error
        ? error.message
        : "Valid release configuration is required.",
    );
  }
  const flag =
    mode === "reference"
      ? "ALLOW_REFERENCE_DATA_INITIALIZATION"
      : "ALLOW_INITIAL_ADMIN_PROVISIONING";
  if (env[flag] !== "true")
    throw new InitializationError(
      `${flag}=true is required for this explicit private command.`,
    );
  const context = {
    environment: env.PORTAL_ENVIRONMENT as "production" | "staging",
    organizationSlug: required(
      env.CAMP_ORGANIZATION_SLUG,
      "CAMP_ORGANIZATION_SLUG",
      80,
    ),
    operatorReference: required(
      env.PROVISIONING_REFERENCE,
      "PROVISIONING_REFERENCE",
    ),
  };
  if (mode === "reference") {
    const input = {
      ...context,
      organizationName: required(
        env.CAMP_ORGANIZATION_NAME,
        "CAMP_ORGANIZATION_NAME",
      ),
      timezone: required(env.CAMP_TIMEZONE, "CAMP_TIMEZONE"),
    };
    validateReferenceInput(input);
    return { mode, input } as const;
  }
  const input = {
    ...context,
    userId: required(env.INITIAL_ADMIN_USER_ID, "INITIAL_ADMIN_USER_ID"),
    email: required(
      env.INITIAL_ADMIN_EMAIL,
      "INITIAL_ADMIN_EMAIL",
      254,
    ).toLowerCase(),
  };
  validateInitialAdministratorInput(input);
  return { mode, input } as const;
}
