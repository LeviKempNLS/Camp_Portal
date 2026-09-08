import test from "node:test";
import assert from "node:assert/strict";
import { assertRegistrationTransition, canTransitionRegistration, requiredFieldsMissing, type FormSchema } from "./index.ts";
test("draft registration may be submitted", () => assert.equal(canTransitionRegistration("draft", "submitted"), true));
test("completed registration cannot be changed", () => assert.throws(() => assertRegistrationTransition("completed", "approved")));
test("only required questions block submission", () => {
 const form: FormSchema = { id:"x", version:1, title:"x", sections:[{id:"a",title:"a",fields:[{id:"needed",type:"text",label:"Needed",required:true},{id:"optional",type:"text",label:"Optional"}]}]};
 assert.deepEqual(requiredFieldsMissing(form, {}), ["needed"]); assert.deepEqual(requiredFieldsMissing(form, {needed:"done"}), []);
});
