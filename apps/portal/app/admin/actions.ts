"use server";

import { RegistrationStatus } from "@prisma/client";
import { transitionRegistrarRegistration } from "@faith-adventures/database/portal";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePortalUser } from "../lib/access";

const reviewStatuses = new Set<RegistrationStatus>([
  RegistrationStatus.APPROVED,
  RegistrationStatus.NEEDS_INFORMATION,
  RegistrationStatus.WAITLISTED,
  RegistrationStatus.CANCELLED,
]);

export async function reviewRegistration(formData: FormData) {
  const user = await requirePortalUser();
  const registrationId = String(formData.get("registrationId") || "");
  const requestedStatus = String(formData.get("status") || "") as RegistrationStatus;
  const reason = String(formData.get("reason") || "").trim();
  if (!registrationId || !reviewStatuses.has(requestedStatus)) throw new Error("Invalid registration review action.");
  await transitionRegistrarRegistration(user.id, registrationId, requestedStatus, reason || undefined);
  revalidatePath("/admin");
  revalidatePath(`/admin/registrations/${registrationId}`);
  redirect(`/admin/registrations/${registrationId}?saved=1`);
}
