"use server";
import { addOwnedHouseholdMember, updateOwnedHousehold } from "@faith-adventures/database/portal";
import { requirePortalUser } from "../lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveHousehold(formData: FormData) {
  const user = await requirePortalUser();
  const displayName = String(formData.get("displayName") || "").trim();
  if (!displayName) throw new Error("Household name is required.");
  await updateOwnedHousehold(user.id, {
    displayName,
    primaryAddress: {
      street: String(formData.get("street") || ""),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      postalCode: String(formData.get("postalCode") || ""),
    },
  });
  revalidatePath("/household");
  redirect("/household?saved=1");
}

export async function addHouseholdMember(formData: FormData) {
  const user = await requirePortalUser();
  const kind = String(formData.get("kind") || "");
  if (kind !== "guardian" && kind !== "camper") throw new Error("Choose a household member type.");
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  if (!firstName || !lastName) throw new Error("First and last name are required.");
  const birthDate = String(formData.get("birthDate") || "");
  const person = await addOwnedHouseholdMember(user.id, {
    kind,
    firstName,
    lastName,
    email: String(formData.get("email") || "").trim() || undefined,
    phone: String(formData.get("phone") || "").trim() || undefined,
    grade: String(formData.get("grade") || "").trim() || undefined,
    birthDate: birthDate ? new Date(`${birthDate}T00:00:00.000Z`) : undefined,
  });
  revalidatePath("/household");
  redirect(`/household/members/${person.id}?added=1`);
}
