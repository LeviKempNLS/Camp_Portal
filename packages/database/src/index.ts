import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export type DatabaseQueryable = {
  $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
};

export async function checkDatabaseConnectivity(client: DatabaseQueryable) {
  try {
    await client.$queryRaw`SELECT 1`;
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export function databaseHealthCheck() {
  return checkDatabaseConnectivity(getPrismaClient());
}
