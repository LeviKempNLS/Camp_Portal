import {
  InitializationError,
  readInitializationConfiguration,
} from "./initialization-configuration.ts";

try {
  const mode = process.argv[2];
  if (mode !== "reference" && mode !== "administrator")
    throw new InitializationError(
      "Select reference or administrator initialization mode.",
    );
  // Validate all operator input before importing the database client or opening a connection.
  const configuration = readInitializationConfiguration(process.env, mode);
  const { PrismaClient } = await import("@prisma/client");
  const { initializeReferenceData, provisionInitialAdministrator } =
    await import("./initialization.ts");
  const prisma = new PrismaClient({ log: [] });
  try {
    const result =
      configuration.mode === "reference"
        ? await initializeReferenceData(prisma, configuration.input)
        : await provisionInitialAdministrator(prisma, configuration.input);
    console.log(`Release initialization: ${result.status}.`);
  } finally {
    await prisma.$disconnect();
  }
} catch (error) {
  // Database/library failures can contain private values; only controlled validation messages are public.
  console.error(
    error instanceof InitializationError
      ? error.message
      : "Release initialization failed; verify configuration and database access using the private operator procedure.",
  );
  process.exitCode = 1;
}
