import { getPrismaClient } from "@faith-adventures/database";

async function main() {
  const email = process.env.DEMO_REGISTRAR_EMAIL;
  if (!email) {
    console.log("DEMO_REGISTRAR_EMAIL is not set; skipping demo registrar role provisioning.");
    return;
  }
  if (!email.endsWith("@example.test")) throw new Error("Demo registrar must use an example.test address.");

  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No Better Auth user exists yet for ${email}; sign up that fictitious account first, then restart the demo service.`);
    return;
  }
  const registrar = await prisma.role.findUniqueOrThrow({ where: { key: "registrar" } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: registrar.id } },
    update: {},
    create: { userId: user.id, roleId: registrar.id },
  });
  console.log(`Granted registrar role to configured fictitious demo account ${email}.`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : "Demo registrar role provisioning failed."); process.exitCode = 1; })
  .finally(async () => getPrismaClient().$disconnect());
