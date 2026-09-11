"use server";
import { createSeason, createSession, getCampTimeZone, updateSeason, updateSession } from "@faith-adventures/database/admin";
import { requirePortalUser } from "../../lib/access";
import { parseCampDateTime } from "../../../lib/camp-timezone";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function optionalDate(formData: FormData, key: string, timeZone: string) {
  const value = String(formData.get(key) || "");
  return value ? parseCampDateTime(value, timeZone) : undefined;
}
function nullableDate(formData: FormData, key: string, timeZone: string) {
  const value = String(formData.get(key) || "");
  return value ? parseCampDateTime(value, timeZone) : null;
}
function requiredDate(formData: FormData, key: string, timeZone: string) {
  const value = String(formData.get(key) || "");
  if (!value) return new Date(Number.NaN);
  return parseCampDateTime(value, timeZone);
}
function bool(formData: FormData, key: string) { return formData.get(key) === "on" || formData.get(key) === "true"; }

export async function addSeason(formData: FormData) {
  const user = await requirePortalUser();
  const timeZone = await getCampTimeZone(user.id);
  await createSeason(user.id, {
    name: String(formData.get("name") || ""), year: Number(formData.get("year")), status: String(formData.get("status") || "draft"),
    registrationOpen: optionalDate(formData, "registrationOpen", timeZone), registrationClose: optionalDate(formData, "registrationClose", timeZone),
  });
  revalidatePath("/admin/configuration"); redirect("/admin/configuration?saved=season");
}

export async function saveSeason(formData: FormData) {
  const user = await requirePortalUser();
  const timeZone = await getCampTimeZone(user.id);
  const seasonId = String(formData.get("seasonId") || "");
  await updateSeason(user.id, seasonId, {
    name: String(formData.get("name") || ""), status: String(formData.get("status") || "draft"),
    registrationOpen: nullableDate(formData, "registrationOpen", timeZone), registrationClose: nullableDate(formData, "registrationClose", timeZone),
  });
  revalidatePath("/admin/configuration"); redirect("/admin/configuration?saved=season");
}

export async function addSession(formData: FormData) {
  const user = await requirePortalUser();
  const timeZone = await getCampTimeZone(user.id);
  await createSession(user.id, {
    seasonId: String(formData.get("seasonId") || ""), name: String(formData.get("name") || ""), description: String(formData.get("description") || ""),
    startDate: requiredDate(formData, "startDate", timeZone), endDate: requiredDate(formData, "endDate", timeZone), capacity: Number(formData.get("capacity")),
    minimumGrade: String(formData.get("minimumGrade") || ""), maximumGrade: String(formData.get("maximumGrade") || ""), basePrice: String(formData.get("basePrice") || "0"),
    depositAmount: String(formData.get("depositAmount") || "") || undefined,
    registrationOpen: optionalDate(formData, "registrationOpen", timeZone), registrationClose: optionalDate(formData, "registrationClose", timeZone),
    waitlistEnabled: bool(formData, "waitlistEnabled"), status: String(formData.get("status") || "draft"),
  });
  revalidatePath("/admin/configuration"); redirect("/admin/configuration?saved=session");
}

export async function saveSession(formData: FormData) {
  const user = await requirePortalUser();
  const timeZone = await getCampTimeZone(user.id);
  const sessionId = String(formData.get("sessionId") || "");
  await updateSession(user.id, sessionId, {
    name: String(formData.get("name") || ""), description: String(formData.get("description") || ""),
    startDate: requiredDate(formData, "startDate", timeZone), endDate: requiredDate(formData, "endDate", timeZone), capacity: Number(formData.get("capacity")),
    minimumGrade: String(formData.get("minimumGrade") || ""), maximumGrade: String(formData.get("maximumGrade") || ""), basePrice: String(formData.get("basePrice") || "0"),
    depositAmount: String(formData.get("depositAmount") || "") || null,
    registrationOpen: nullableDate(formData, "registrationOpen", timeZone), registrationClose: nullableDate(formData, "registrationClose", timeZone),
    waitlistEnabled: bool(formData, "waitlistEnabled"), status: String(formData.get("status") || "draft"),
  });
  revalidatePath("/admin/configuration"); redirect("/admin/configuration?saved=session");
}
