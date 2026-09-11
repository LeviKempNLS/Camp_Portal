import test from "node:test";
import assert from "node:assert/strict";
import { CAMP_REGISTRATION_FORM, assertRegistrationTransition, canTransitionRegistration, requiredFieldsMissing, validateFormAnswers, type FormSchema } from "./index.ts";

test("draft registration may be submitted", () => assert.equal(canTransitionRegistration("draft", "submitted"), true));
test("completed registration cannot be changed", () => assert.throws(() => assertRegistrationTransition("completed", "approved")));
test("only required questions block submission", () => {
 const form: FormSchema = { id:"x", version:1, title:"x", sections:[{id:"a",title:"a",fields:[{id:"needed",type:"text",label:"Needed",required:true},{id:"optional",type:"text",label:"Optional"}]}]};
 assert.deepEqual(requiredFieldsMissing(form, {}), ["needed"]); assert.deepEqual(requiredFieldsMissing(form, {needed:"done"}), []);
});
test("required checkboxes must be checked", () => {
 const form: FormSchema = { id:"x", version:1, title:"x", sections:[{id:"a",title:"a",fields:[{id:"release",type:"checkbox",label:"Release",required:true}]}]};
 assert.deepEqual(requiredFieldsMissing(form, {release:false}), ["release"]);
 assert.deepEqual(requiredFieldsMissing(form, {release:true}), []);
});
test("registration answer validation rejects incomplete and malformed payloads", () => {
 assert.ok(validateFormAnswers(CAMP_REGISTRATION_FORM, {}).includes("camperName"));
 assert.ok(validateFormAnswers(CAMP_REGISTRATION_FORM, { medicalRelease: false }).includes("medicalRelease"));
 assert.deepEqual(validateFormAnswers({id:"x",version:1,title:"x",sections:[{id:"a",title:"a",fields:[{id:"choice",type:"select",label:"Choice",options:[{label:"A",value:"a"}]}]}]}, {choice:"bogus"}), ["choice"]);
 assert.deepEqual(validateFormAnswers(CAMP_REGISTRATION_FORM, []), ["answers"]);
});
