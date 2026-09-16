"use server";

import { assignCamperPlacement, removeCamperPlacement, RosterValidationError } from "@faith-adventures/database/roster";
import { requirePortalUser } from "../../lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function returnTo(formData: FormData) {
  const value = String(formData.get("returnTo") || "/admin/roster");
  return value.startsWith("/admin/roster") ? value : "/admin/roster";
}

function withMessage(target: string, key: "saved" | "error", value: string) {
  const [path, query = ""] = target.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("saved");
  params.delete("error");
  params.set(key, value);
  return `${path}?${params.toString()}`;
}

export async function saveCamperPlacement(formData: FormData) {
  const user = await requirePortalUser();
  const target = returnTo(formData);
  try {
    await assignCamperPlacement(user.id, {
      registrationId: String(formData.get("registrationId") || ""),
      groupId: String(formData.get("groupId") || "") || undefined,
      cabinId: String(formData.get("cabinId") || "") || undefined,
    });
  } catch (error) {
    if (error instanceof RosterValidationError) redirect(withMessage(target, "error", error.message));
    throw error;
  }
  revalidatePath("/admin/roster");
  revalidatePath("/staff");
  redirect(withMessage(target, "saved", "placement"));
}

export async function clearCamperPlacement(formData: FormData) {
  const user = await requirePortalUser();
  const target = returnTo(formData);
  await removeCamperPlacement(user.id, String(formData.get("registrationId") || ""));
  revalidatePath("/admin/roster");
  revalidatePath("/staff");
  redirect(withMessage(target, "saved", "placement"));
}
