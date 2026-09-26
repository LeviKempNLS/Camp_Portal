"use server";

import {
  createChurch,
  createScholarshipProgram,
  FinanceValidationError,
  recordAdjustment,
  recordChurchCommitment,
  recordChurchPayment,
  recordManualPayment,
  recordRefund,
  recordScholarshipCredit,
  reverseFinancialEntry,
  updateChurch,
  updateScholarshipProgram,
} from "@faith-adventures/database/finance";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePortalUser } from "../../lib/access";

function returnTo(formData: FormData) {
  const value = String(formData.get("returnTo") || "/admin/finance");
  return value.startsWith("/admin/finance") ? value : "/admin/finance";
}

function withMessage(target: string, key: "saved" | "error", value: string) {
  const [path, query = ""] = target.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("saved");
  params.delete("error");
  params.set(key, value);
  return `${path}?${params.toString()}`;
}

async function runFinanceAction(formData: FormData, operation: (userId: string) => Promise<unknown>, saved: string) {
  const user = await requirePortalUser();
  const target = returnTo(formData);
  try {
    await operation(user.id);
  } catch (error) {
    if (error instanceof FinanceValidationError) redirect(withMessage(target, "error", error.message));
    throw error;
  }
  revalidatePath("/admin/finance");
  redirect(withMessage(target, "saved", saved));
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function method(formData: FormData): "CHECK" | "CASH" | "OTHER" {
  const value = text(formData, "method");
  return value === "CASH" || value === "OTHER" ? value : "CHECK";
}

export async function recordManualPaymentAction(formData: FormData) {
  return runFinanceAction(formData, userId => recordManualPayment(userId, {
    registrationId: text(formData, "registrationId"),
    amount: text(formData, "amount"),
    method: method(formData),
    reference: text(formData, "reference") || undefined,
    note: text(formData, "note") || undefined,
  }), "payment");
}

export async function recordScholarshipAction(formData: FormData) {
  return runFinanceAction(formData, userId => recordScholarshipCredit(userId, {
    registrationId: text(formData, "registrationId"),
    scholarshipProgramId: text(formData, "scholarshipProgramId"),
    amount: text(formData, "amount"),
    note: text(formData, "note") || undefined,
  }), "scholarship");
}

export async function recordChurchCommitmentAction(formData: FormData) {
  return runFinanceAction(formData, userId => recordChurchCommitment(userId, {
    registrationId: text(formData, "registrationId"),
    churchId: text(formData, "churchId"),
    amount: text(formData, "amount"),
    note: text(formData, "note") || undefined,
  }), "church commitment");
}

export async function recordChurchPaymentAction(formData: FormData) {
  return runFinanceAction(formData, userId => recordChurchPayment(userId, {
    registrationId: text(formData, "registrationId"),
    churchId: text(formData, "churchId"),
    amount: text(formData, "amount"),
    method: method(formData),
    reference: text(formData, "reference") || undefined,
    note: text(formData, "note") || undefined,
  }), "church payment");
}

export async function recordAdjustmentAction(formData: FormData) {
  return runFinanceAction(formData, userId => recordAdjustment(userId, {
    registrationId: text(formData, "registrationId"),
    amount: text(formData, "amount"),
    note: text(formData, "note"),
  }), "adjustment");
}

export async function recordRefundAction(formData: FormData) {
  return runFinanceAction(formData, userId => recordRefund(userId, {
    registrationId: text(formData, "registrationId"),
    amount: text(formData, "amount"),
    method: method(formData),
    reference: text(formData, "reference") || undefined,
    note: text(formData, "note") || undefined,
  }), "refund");
}

export async function reverseFinancialEntryAction(formData: FormData) {
  return runFinanceAction(formData, userId => reverseFinancialEntry(userId, text(formData, "entryId"), text(formData, "note")), "reversal");
}

export async function createChurchAction(formData: FormData) {
  return runFinanceAction(formData, userId => createChurch(userId, {
    name: text(formData, "name"),
    contactName: text(formData, "contactName") || undefined,
    contactEmail: text(formData, "contactEmail") || undefined,
  }), "church");
}

export async function updateChurchAction(formData: FormData) {
  return runFinanceAction(formData, userId => updateChurch(userId, {
    churchId: text(formData, "churchId"),
    name: text(formData, "name"),
    contactName: text(formData, "contactName") || undefined,
    contactEmail: text(formData, "contactEmail") || undefined,
    active: formData.get("active") === "on",
  }), "church");
}

export async function createScholarshipAction(formData: FormData) {
  return runFinanceAction(formData, userId => createScholarshipProgram(userId, text(formData, "name")), "scholarship program");
}

export async function updateScholarshipAction(formData: FormData) {
  return runFinanceAction(formData, userId => updateScholarshipProgram(userId, {
    scholarshipProgramId: text(formData, "scholarshipProgramId"),
    name: text(formData, "name"),
    active: formData.get("active") === "on",
  }), "scholarship program");
}
