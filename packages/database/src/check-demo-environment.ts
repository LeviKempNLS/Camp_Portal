import { assertDemoDataAllowed } from "./environment-safety.ts";

try {
  assertDemoDataAllowed(process.env);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Demo environment check failed.",
  );
  process.exitCode = 1;
}
