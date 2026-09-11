import test from "node:test";
import assert from "node:assert/strict";
import { formatCampDateTime, parseCampDateTime } from "./camp-timezone.ts";

test("camp-local summer time round-trips through UTC", () => {
  const instant = parseCampDateTime("2032-07-01T09:00", "America/Chicago");
  assert.equal(instant.toISOString(), "2032-07-01T14:00:00.000Z");
  assert.equal(formatCampDateTime(instant, "America/Chicago"), "2032-07-01T09:00");
});

test("nonexistent daylight-saving local time is rejected", () => {
  assert.throws(() => parseCampDateTime("2032-03-14T02:30", "America/Chicago"));
});
