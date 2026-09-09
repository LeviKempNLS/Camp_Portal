import test from "node:test";
import assert from "node:assert/strict";
import { DraftSaveCoordinator, type DraftSaveState } from "./draft-save-coordinator.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("serializes writes, protects stale saved state, and waits for the final flush", async () => {
  const oldStarted = deferred();
  const oldGate = deferred();
  const finalStarted = deferred();
  const finalGate = deferred();
  const started: string[] = [];
  const persisted: string[] = [];
  const states: DraftSaveState[] = [];

  const coordinator = new DraftSaveCoordinator<string>(
    async (value) => {
      started.push(value);
      if (value === "old") {
        oldStarted.resolve();
        await oldGate.promise;
      }
      if (value === "new") {
        finalStarted.resolve();
        await finalGate.promise;
      }
      persisted.push(value);
    },
    (state) => states.push(state),
  );

  const revision1 = coordinator.edit();
  const oldSave = coordinator.save("old", revision1);
  await oldStarted.promise;
  assert.deepEqual(started, ["old"]);

  const revision2 = coordinator.edit();
  const finalSave = coordinator.save("new", revision2);
  let finalSettled = false;
  void finalSave.then(() => {
    finalSettled = true;
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["old"], "newer save must wait behind the older in-flight save");

  oldGate.resolve();
  assert.equal(await oldSave, true);
  await finalStarted.promise;

  assert.deepEqual(started, ["old", "new"]);
  assert.equal(finalSettled, false, "final save must not resolve before its persistence completes");
  assert.equal(states.includes("saved"), false, "stale revision completion must not report Saved");

  finalGate.resolve();
  assert.equal(await finalSave, true);
  assert.deepEqual(persisted, ["old", "new"]);
  assert.equal(states.at(-1), "saved");
});

test("a failed save does not poison later queued saves", async () => {
  const persisted: string[] = [];
  const states: DraftSaveState[] = [];
  const coordinator = new DraftSaveCoordinator<string>(
    async (value) => {
      if (value === "bad") throw new Error("expected failure");
      persisted.push(value);
    },
    (state) => states.push(state),
  );

  const failedRevision = coordinator.edit();
  assert.equal(await coordinator.save("bad", failedRevision), false);
  assert.equal(states.at(-1), "failed");

  const recoveredRevision = coordinator.edit();
  assert.equal(await coordinator.save("recovered", recoveredRevision), true);
  assert.deepEqual(persisted, ["recovered"]);
  assert.equal(states.at(-1), "saved");
});
