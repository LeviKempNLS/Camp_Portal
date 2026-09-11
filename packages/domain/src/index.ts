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

export const CAMP_REGISTRATION_FORM: FormSchema = {
  id: "camp-registration",
  version: 1,
  title: "Faith Adventures Camp registration",
  sections: [
    { id: "camp", title: "Camp selection", fields: [
      { id: "session", type: "select", label: "Camp group", required: true, options: [
        { label: "Try It - completed K-2", value: "try-it" },
        { label: "JYF - completed 3-5", value: "jyf" },
        { label: "Chirho - completed 6-8", value: "chirho" },
        { label: "CYF - completed 9-12", value: "cyf" },
      ] },
      { id: "firstTime", type: "boolean", label: "Is this their first time at Faith Adventures Camp?" },
      { id: "swims", type: "boolean", label: "Does the participant swim?" },
      { id: "shirtSize", type: "select", label: "Camper T-shirt size", required: true, options: ["Youth S", "Youth M", "Adult S", "Adult M", "Adult L", "Adult XL", "Adult 2XL", "Adult 3XL"].map(value => ({ label: value, value })) },
    ] },
    { id: "camper", title: "Camper information", fields: [
      { id: "camperName", type: "text", label: "Camper full name", required: true },
      { id: "birthDate", type: "date", label: "Date of birth", required: true },
      { id: "grade", type: "text", label: "Grade just completed", required: true },
      { id: "camperEmail", type: "text", label: "Camper email" },
      { id: "cabinMate", type: "text", label: "One mutual cabin-mate request", helpText: "Requests are considered but not guaranteed." },
    ] },
    { id: "guardian", title: "Parent or guardian", fields: [
      { id: "guardianName", type: "text", label: "Parent/guardian full name", required: true },
      { id: "guardianEmail", type: "text", label: "Email address", required: true },
      { id: "guardianPhone", type: "text", label: "Best phone number", required: true },
      { id: "address", type: "textarea", label: "Home address", required: true },
      { id: "emergencyContact", type: "text", label: "Emergency contact name and phone", required: true },
      { id: "pickupRestrictions", type: "textarea", label: "Pickup restrictions", helpText: "List people who may not pick up your child, with the reason if applicable." },
    ] },
    { id: "health", title: "Health and care", description: "Only authorized medical staff and designated leaders may access this section.", fields: [
      { id: "insurance", type: "text", label: "Medical insurance carrier and policy/group number", required: true, sensitive: true },
      { id: "allergies", type: "textarea", label: "Allergies and how to manage reactions", required: true, sensitive: true },
      { id: "dietary", type: "textarea", label: "Dietary needs or restrictions", sensitive: true },
      { id: "medications", type: "textarea", label: "Medications, dosage, and timing", sensitive: true },
      { id: "healthNotes", type: "textarea", label: "Anything else camp leaders should know", sensitive: true },
    ] },
    { id: "releases", title: "Releases and covenant", fields: [
      { id: "medicalRelease", type: "checkbox", label: "I authorize routine and emergency health care as described in the camp release.", required: true },
      { id: "transportRelease", type: "checkbox", label: "I authorize transportation in vehicles designated by camp leadership.", required: true },
      { id: "photoRelease", type: "checkbox", label: "I authorize photography, video, and audio use for camp communications.", required: true },
      { id: "covenant", type: "checkbox", label: "The participant agrees to the Faith Adventures Camp covenant.", required: true },
    ] },
  ],
};

function isMissing(field: FormField, answer: FormAnswers[string]) {
  if (answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0)) return true;
  return field.type === "checkbox" && answer !== true;
}

export function requiredFieldsMissing(schema: FormSchema, answers: FormAnswers) {
  return schema.sections.flatMap(s => s.fields).filter(f => f.required && isMissing(f, answers[f.id])).map(f => f.id);
}

export function validateFormAnswers(schema: FormSchema, answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return ["answers"];
  const values = answers as FormAnswers;
  const errors = [...requiredFieldsMissing(schema, values)];
  for (const field of schema.sections.flatMap(section => section.fields)) {
    const value = values[field.id];
    if (value === undefined || value === "") continue;
    if ((field.type === "boolean" || field.type === "checkbox") && typeof value !== "boolean") errors.push(field.id);
    else if (field.type === "multi-select" && (!Array.isArray(value) || value.some(item => typeof item !== "string"))) errors.push(field.id);
    else if (!["boolean", "checkbox", "multi-select"].includes(field.type) && typeof value !== "string") errors.push(field.id);
    if ((field.type === "select" || field.type === "radio") && typeof value === "string" && field.options && !field.options.some(option => option.value === value)) errors.push(field.id);
  }
  return [...new Set(errors)];
}
