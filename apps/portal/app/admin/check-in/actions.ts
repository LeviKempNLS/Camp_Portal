"use server";

import { AttendanceValidationError, checkInCamper, checkOutCamper } from "@faith-adventures/database/attendance";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePortalUser } from "../../lib/access";

function returnTo(formData: FormData) {
  const value = String(formData.get("returnTo") || "/admin/check-in");
  return value.startsWith("/admin/check-in") ? value : "/admin/check-in";
}
function withMessage(target: string, key: "saved" | "error", value: string) {
  const [path, query = ""] = target.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("saved");
  params.delete("error");
  params.set(key, value);
  return `${path}?${params.toString()}`;
}
export async function checkInAction(formData: FormData) {
  const user = await requirePortalUser();
  const target = returnTo(formData);
  try {
    await checkInCamper(user.id, String(formData.get("registrationId") || ""), String(formData.get("notes") || "") || undefined);
  } catch (error) {
    if (error instanceof AttendanceValidationError) redirect(withMessage(target, "error", error.message));
    throw error;
  }
  revalidatePath("/admin/check-in");
  redirect(withMessage(target, "saved", "checked-in"));
}
export async function checkOutAction(formData: FormData) {
  const user = await requirePortalUser();
  const target = returnTo(formData);
  try {
    await checkOutCamper(user.id, String(formData.get("registrationId") || ""));
  } catch (error) {
    if (error instanceof AttendanceValidationError) redirect(withMessage(target, "error", error.message));
    throw error;
  }
  revalidatePath("/admin/check-in");
  redirect(withMessage(target, "saved", "checked-out"));
}
