"use server";

import { CommunicationsValidationError, markOutboxSimulatedSent, queueOutboxMessage } from "@faith-adventures/database/communications";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePortalUser } from "../../lib/access";

function withMessage(key: "saved" | "error", value: string) {
  const params = new URLSearchParams({ [key]: value });
  return `/admin/communications?${params}`;
}
export async function queueMessageAction(formData: FormData) {
  const user = await requirePortalUser();
  try {
    await queueOutboxMessage(user.id, {
      audienceType: String(formData.get("audienceType") || ""),
      audienceRef: String(formData.get("audienceRef") || "") || undefined,
      subject: String(formData.get("subject") || ""),
      body: String(formData.get("body") || ""),
    });
  } catch (error) {
    if (error instanceof CommunicationsValidationError) redirect(withMessage("error", error.message));
    throw error;
  }
  revalidatePath("/admin/communications");
  redirect(withMessage("saved", "queued"));
}
export async function simulateSentAction(formData: FormData) {
  const user = await requirePortalUser();
  try { await markOutboxSimulatedSent(user.id, String(formData.get("messageId") || "")); }
  catch (error) {
    if (error instanceof CommunicationsValidationError) redirect(withMessage("error", error.message));
    throw error;
  }
  revalidatePath("/admin/communications");
  redirect(withMessage("saved", "sent"));
}
