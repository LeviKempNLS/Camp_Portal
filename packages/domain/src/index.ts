export type RegistrationStatus = "draft" | "submitted" | "pending_review" | "needs_information" | "approved" | "waitlisted" | "cancelled" | "checked_in" | "completed";

const transitions: Record<RegistrationStatus, RegistrationStatus[]> = {
  draft: ["submitted", "cancelled"], submitted: ["pending_review", "needs_information", "approved", "waitlisted", "cancelled"],
  pending_review: ["needs_information", "approved", "waitlisted", "cancelled"], needs_information: ["draft", "submitted", "cancelled"],
  approved: ["checked_in", "cancelled"], waitlisted: ["submitted", "approved", "cancelled"], checked_in: ["completed"], completed: [], cancelled: []
};

export function canTransitionRegistration(from: RegistrationStatus, to: RegistrationStatus) { return transitions[from].includes(to); }
export function assertRegistrationTransition(from: RegistrationStatus, to: RegistrationStatus) {
  if (!canTransitionRegistration(from, to)) throw new Error(`Cannot transition registration from ${from} to ${to}.`);
}

export type FormField = { id: string; type: "text" | "textarea" | "number" | "date" | "boolean" | "checkbox" | "radio" | "select" | "multi-select"; label: string; helpText?: string; required?: boolean; options?: { label: string; value: string }[]; sensitive?: boolean };
export type FormSection = { id: string; title: string; description?: string; fields: FormField[] };
export type FormSchema = { id: string; version: number; title: string; sections: FormSection[] };
export type FormAnswers = Record<string, string | boolean | string[] | undefined>;

function isMissing(answer: FormAnswers[string]) {
  return answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0);
}
export function requiredFieldsMissing(schema: FormSchema, answers: FormAnswers) {
  return schema.sections.flatMap(s => s.fields).filter(f => f.required && isMissing(answers[f.id])).map(f => f.id);
}
