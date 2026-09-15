"use server";

import { assignStaff, createCabin, createCampGroup, removeStaffAssignment } from "@faith-adventures/database/operations";
import { requirePortalUser } from "../../lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function positiveInteger(value: FormDataEntryValue | null, optional = false) {
  const text = String(value ?? "").trim();
  if (!text && optional) return undefined;
  return Number(text);
}

export async function addGroup(formData: FormData) {
  const user = await requirePortalUser();
  await createCampGroup(user.id, {
    sessionId: String(formData.get("sessionId") || ""),
    name: String(formData.get("name") || ""),
    capacity: positiveInteger(formData.get("capacity"), true),
  });
  revalidatePath("/admin/operations");
  redirect("/admin/operations?saved=group");
}

export async function addCabin(formData: FormData) {
  const user = await requirePortalUser();
  await createCabin(user.id, {
    sessionId: String(formData.get("sessionId") || ""),
    groupId: String(formData.get("groupId") || "") || undefined,
    name: String(formData.get("name") || ""),
    capacity: positiveInteger(formData.get("capacity")) ?? Number.NaN,
  });
  revalidatePath("/admin/operations");
  redirect("/admin/operations?saved=cabin");
}

export async function addStaff(formData: FormData) {
  const user = await requirePortalUser();
  await assignStaff(user.id, {
    sessionId: String(formData.get("sessionId") || ""),
    personId: String(formData.get("personId") || ""),
    role: String(formData.get("role") || ""),
    groupId: String(formData.get("groupId") || "") || undefined,
    cabinId: String(formData.get("cabinId") || "") || undefined,
  });
  revalidatePath("/admin/operations");
  revalidatePath("/staff");
  revalidatePath("/dashboard");
  redirect("/admin/operations?saved=staff");
}

export async function removeStaff(formData: FormData) {
  const user = await requirePortalUser();
  await removeStaffAssignment(user.id, String(formData.get("assignmentId") || ""));
  revalidatePath("/admin/operations");
  revalidatePath("/staff");
  revalidatePath("/dashboard");
  redirect("/admin/operations?saved=staff");
}
