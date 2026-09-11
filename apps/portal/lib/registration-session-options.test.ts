import test from "node:test";
import assert from "node:assert/strict";
import { sessionSelectable, sessionWindowOpen, type RegistrationSessionOption } from "./registration-session-options.ts";

const now = new Date("2030-06-15T12:00:00.000Z");
const session = (overrides: Partial<RegistrationSessionOption> = {}): RegistrationSessionOption => ({
  id: "jyf",
  status: "open",
  registrationOpen: new Date("2030-01-01T00:00:00.000Z"),
  registrationClose: new Date("2030-06-01T00:00:00.000Z"),
  season: {
    status: "open",
    registrationOpen: null,
    registrationClose: null,
  },
  ...overrides,
});

test("closed registration windows stay selectable for requested corrections", () => {
  const closedWindow = session();
  assert.equal(sessionWindowOpen(closedWindow, now), false);
  assert.equal(sessionSelectable(closedWindow, new Set([closedWindow.id]), now), true);
  assert.equal(sessionSelectable(closedWindow, new Set(), now), false);
});

test("corrections do not reopen closed sessions or seasons", () => {
  assert.equal(sessionSelectable(session({ status: "closed" }), new Set(["jyf"]), now), false);
  assert.equal(sessionSelectable(session({ season: { status: "closed", registrationOpen: null, registrationClose: null } }), new Set(["jyf"]), now), false);
});
