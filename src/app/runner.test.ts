// src/app/runner.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ITERATIONS, NOTICE_CODES, REPEAT_FACTOR } from "../layout";
import { inputsHash } from "../model/hash";
import type { Lock, Notice, Project } from "../model/types";
import { DEBOUNCE_MS, IMPROVE_FACTOR, canOptimize, createRunner } from "./runner";
import { createState } from "./state";
import type { State } from "./state";
import type { LayoutClient } from "./clients";
import { fixtureProject, flush, makeLayout, makeResult, stubLayoutClient } from "./test-helpers";

function bumpHeight(state: State): void {
  const p = state.project.value;
  state.project.value = { ...p, box: { ...p.box, innerHeight: p.box.innerHeight + 1 } };
}

function setup(project: Project = fixtureProject(), confirm = vi.fn(() => true)) {
  const state = createState(project);
  const stub = stubLayoutClient();
  const onAccepted = vi.fn();
  const runner = createRunner(
    state,
    { loadLayoutClient: () => Promise.resolve(stub.client), confirm },
    { onAccepted },
  );
  return { state, stub, runner, onAccepted, confirm };
}

describe("runner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("five quick edits start exactly one run after the debounce", async () => {
    const { state, stub, runner } = setup();
    for (let i = 0; i < 5; i += 1) {
      bumpHeight(state);
      runner.schedule();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(stub.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.input.inputsHash).toBe(inputsHash(state.project.value));
  });

  it("accepts a finished run and keeps the previous layout for undo", async () => {
    const p = fixtureProject();
    const old = makeLayout(inputsHash(p));
    const { state, stub, runner, onAccepted } = setup({ ...p, layout: old });
    void runner.runNow("edit", "user");
    await flush();
    const call = stub.calls[0];
    if (!call) {
      throw new Error("no run");
    }
    expect(call.warmStart).toBe(old);
    call.onProgress(500, 1000, makeResult(null));
    expect(state.run.value).toEqual({ status: "running", done: 500, total: 1000 });
    const next = makeLayout(call.input.inputsHash);
    call.resolve(makeResult(next));
    await flush();
    expect(state.project.value.layout).toBe(next);
    expect(state.history.undo()?.layout).toBe(old);
    expect(state.run.value).toEqual({ status: "done" });
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it("a result for stale inputs is discarded and the newer run is accepted", async () => {
    const { state, stub, runner } = setup();
    void runner.runNow("edit", "user");
    await flush();
    const first = stub.calls[0];
    bumpHeight(state);
    runner.schedule();
    first?.resolve(makeResult(makeLayout(first.input.inputsHash)));
    await flush();
    expect(state.project.value.layout).toBeUndefined();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flush();
    const second = stub.calls[1];
    expect(second).toBeDefined();
    const fresh = makeLayout(second?.input.inputsHash ?? "");
    second?.resolve(makeResult(fresh));
    await flush();
    expect(state.project.value.layout).toBe(fresh);
  });

  it("ignores progress and results of a cancelled run", async () => {
    const { state, stub, runner } = setup();
    void runner.runNow("edit", "user");
    await flush();
    runner.cancel();
    expect(state.run.value).toEqual({ status: "idle" });
    stub.calls[0]?.onProgress(10, 100, makeResult(null));
    stub.calls[0]?.resolve(makeResult(makeLayout(stub.calls[0].input.inputsHash)));
    await flush();
    expect(state.run.value).toEqual({ status: "idle" });
    expect(state.project.value.layout).toBeUndefined();
    expect(stub.cancelCount()).toBeGreaterThan(0);
  });

  it("keeps the last good layout on failure and retries", async () => {
    const p = fixtureProject();
    const good = makeLayout(inputsHash(p));
    const { state, stub, runner } = setup({ ...p, layout: good });
    void runner.runNow("improve", "user");
    await flush();
    stub.calls[0]?.reject(new Error("worker crashed"));
    await flush();
    expect(state.run.value).toEqual({ status: "error", message: "worker crashed" });
    expect(state.project.value.layout).toBe(good);
    void runner.retry();
    await flush();
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[1]?.iterations).toBe(IMPROVE_FACTOR * DEFAULT_ITERATIONS);
    expect(stub.calls[1]?.warmStart).toBe(good);
  });

  it("improve more runs 3N more iterations from the stored seed and layout", async () => {
    const p = fixtureProject();
    const layout = makeLayout(inputsHash(p), undefined, { seed: 7, iterations: 1234 });
    const { stub, runner } = setup({ ...p, layout });
    void runner.runNow("improve", "user");
    await flush();
    expect(stub.calls[0]?.seed).toBe(7);
    expect(stub.calls[0]?.iterations).toBe(IMPROVE_FACTOR * DEFAULT_ITERATIONS);
    expect(stub.calls[0]?.warmStart).toBe(layout);
  });

  describe("pins that conflict", () => {
    const locks: Lock[] = [
      { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
      { kind: "size", trayKey: "b:p0:0", w: 50, d: 40, h: 20 },
    ];
    const conflict = {
      trayKey: "b:p0:0",
      name: "Deck B ×40",
      reason: "its contents no longer fit that size",
    };

    async function conflicted() {
      const p = fixtureProject();
      const old = makeLayout(inputsHash({ ...p, locks }));
      const s = setup({ ...p, locks, layout: old });
      void s.runner.runNow("edit", "user");
      await flush();
      const call = s.stub.calls[0];
      if (!call) {
        throw new Error("no run");
      }
      call.resolve(makeResult(makeLayout(call.input.inputsHash), { lockConflicts: [conflict] }));
      await flush();
      return { ...s, old, call };
    }

    it("keeps every pin and the previous plan when pins conflict", async () => {
      const { state, stub, old, onAccepted } = await conflicted();
      expect(state.project.value.locks).toEqual(locks);
      expect(state.project.value.layout).toBe(old);
      // nothing was accepted: no history step, no save, no new run
      expect(state.history.canUndo.value).toBe(false);
      expect(onAccepted).not.toHaveBeenCalled();
      expect(state.run.value).toEqual({ status: "done" });
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
      await flush();
      expect(stub.calls).toHaveLength(1);
    });

    it("reports which pins conflict and why", async () => {
      const { state } = await conflicted();
      expect(state.lockConflicts.value).toEqual([conflict]);
    });

    it("shows what a search that found no plan reports, next to the conflicts", async () => {
      const p = fixtureProject();
      const old = makeLayout(inputsHash({ ...p, locks }));
      const { state, stub, runner } = setup({ ...p, locks, layout: old });
      void runner.runNow("edit", "user");
      await flush();
      const call = stub.calls[0];
      if (!call) {
        throw new Error("no run");
      }
      const shortfall = { x: 12, y: 0, z: 0 };
      const doesNotFit: Notice = {
        level: "error",
        code: NOTICE_CODES.doesNotFit,
        message: "Nothing fits.",
      };
      call.resolve(
        makeResult(null, {
          bestAttempt: { trays: [], shortfall },
          notices: [doesNotFit],
          lockConflicts: [conflict],
        }),
      );
      await flush();
      expect(state.lockConflicts.value).toEqual([conflict]);
      expect(state.shortfall.value).toEqual(shortfall);
      expect(state.layoutNotices.value).toContainEqual(doesNotFit);
      // no project change
      expect(state.project.value.locks).toEqual(locks);
      expect(state.project.value.layout).toBe(old);
      expect(state.history.canUndo.value).toBe(false);
    });

    it("discards a run that reported pins without searching, and doesn't count it as a failed search", async () => {
      const p = fixtureProject();
      const { state, stub, runner } = setup({ ...p, locks });
      void runner.runNow("edit", "user");
      await flush();
      stub.calls[0]?.resolve(makeResult(null, { lockConflicts: [conflict] }));
      await flush();
      expect(state.lockConflicts.value).toEqual([conflict]);
      expect(state.lastResult.value).toBeNull();
      // a repeat gets the normal budget: nothing was searched
      void runner.runNow("edit", "user");
      await flush();
      expect(stub.calls[1]?.iterations).toBe(DEFAULT_ITERATIONS);
    });

    it("clears the conflicts when a later run has none, and accepts that plan", async () => {
      const { state, stub, runner } = await conflicted();
      state.project.value = {
        ...state.project.value,
        locks: [locks[0] as Lock],
      };
      void runner.runNow("edit", "user");
      await flush();
      const call = stub.calls[1];
      if (!call) {
        throw new Error("no second run");
      }
      const next = makeLayout(call.input.inputsHash);
      call.resolve(makeResult(next));
      await flush();
      expect(state.lockConflicts.value).toEqual([]);
      expect(state.project.value.layout).toBe(next);
    });

    it("never prunes pins on its own, even for lock.dropped notices", async () => {
      const p = fixtureProject();
      const { state, stub, runner } = setup({ ...p, locks });
      void runner.runNow("edit", "user");
      await flush();
      const call = stub.calls[0];
      if (!call) {
        throw new Error("no run");
      }
      const notice: Notice = {
        level: "warning",
        code: NOTICE_CODES.lockDropped,
        message: "dropped",
        path: "/locks/1",
      };
      call.resolve(makeResult(makeLayout(call.input.inputsHash), { notices: [notice] }));
      await flush();
      expect(state.project.value.locks).toEqual(locks);
    });
  });

  it("does not run without components or with invalid inputs", async () => {
    const p = fixtureProject();
    const empty = setup({ ...p, components: [] });
    expect(canOptimize(empty.state.project.value)).toBe(false);
    void empty.runner.runNow("edit", "user");
    await flush();
    expect(empty.stub.calls).toHaveLength(0);
    const invalid = setup({ ...p, box: { ...p.box, innerWidth: 0 } });
    void invalid.runner.runNow("edit", "user");
    await flush();
    expect(invalid.stub.calls).toHaveLength(0);
  });

  it("afterOpen runs at once without a layout and never with one", async () => {
    const fresh = setup();
    fresh.runner.afterOpen();
    await flush();
    expect(fresh.stub.calls).toHaveLength(1);
    const p = fixtureProject();
    const stored = setup({ ...p, layout: makeLayout("anything") });
    stored.runner.afterOpen();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await flush();
    expect(stored.stub.calls).toHaveLength(0);
  });

  it("newer-minor projects skip automatic runs and ask before a user run", async () => {
    const confirm = vi.fn(() => false);
    const { state, stub, runner } = setup(fixtureProject(), confirm);
    state.needsConfirm.value = true;
    void runner.runNow("edit", "auto");
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    void runner.runNow("edit", "user");
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(stub.calls).toHaveLength(0);
    confirm.mockReturnValue(true);
    void runner.runNow("edit", "user");
    await flush();
    expect(stub.calls).toHaveLength(1);
    expect(state.needsConfirm.value).toBe(false);
  });

  it("an infeasible result keeps the layout and is not undoable", async () => {
    const p = fixtureProject();
    const good = makeLayout(inputsHash(p));
    const { state, stub, runner, onAccepted } = setup({ ...p, layout: good });
    void runner.runNow("edit", "user");
    await flush();
    stub.calls[0]?.resolve(makeResult(null));
    await flush();
    expect(state.project.value.layout).toBe(good);
    expect(state.history.canUndo.value).toBe(false);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(state.lastResult.value?.layout).toBeNull();
  });

  it("a repeated user run after a search that found no fit searches longer; edits and auto runs do not", async () => {
    const { stub, runner, state } = setup();
    void runner.runNow("edit", "user");
    await flush();
    expect(stub.calls[0]?.iterations).toBe(DEFAULT_ITERATIONS);
    stub.calls[0]?.resolve(makeResult(null));
    await flush();
    void runner.runNow("edit", "user");
    await flush();
    expect(stub.calls[1]?.iterations).toBe(REPEAT_FACTOR * DEFAULT_ITERATIONS);
    stub.calls[1]?.resolve(makeResult(null));
    await flush();
    void runner.runNow("edit", "user");
    await flush();
    expect(stub.calls[2]?.iterations).toBe(REPEAT_FACTOR * REPEAT_FACTOR * DEFAULT_ITERATIONS);
    stub.calls[2]?.resolve(makeResult(null));
    await flush();
    void runner.runNow("edit", "auto");
    await flush();
    expect(stub.calls[3]?.iterations).toBe(DEFAULT_ITERATIONS);
    stub.calls[3]?.resolve(makeResult(null));
    await flush();
    bumpHeight(state);
    void runner.runNow("edit", "user");
    await flush();
    expect(stub.calls[4]?.iterations).toBe(DEFAULT_ITERATIONS);
    stub.calls[4]?.resolve(makeResult(makeLayout(inputsHash(state.project.value))));
    await flush();
    void runner.runNow("edit", "user");
    await flush();
    expect(stub.calls[5]?.iterations).toBe(DEFAULT_ITERATIONS);
  });

  it("the growth of a repeat is the same factor as the improve budget", () => {
    expect(REPEAT_FACTOR).toBe(IMPROVE_FACTOR);
  });

  it("treats a LayoutCancelledError as a quiet cancel, not a failure", async () => {
    const { state, stub, runner } = setup();
    void runner.runNow("edit", "user");
    await flush();
    const cancelled = new Error("Layout run cancelled");
    cancelled.name = "LayoutCancelledError";
    stub.calls[0]?.reject(cancelled);
    await flush();
    expect(state.run.value).toEqual({ status: "idle" });
  });

  it("surfaces a failing client loader as a run error", async () => {
    const state = createState(fixtureProject());
    const runner = createRunner(
      state,
      { loadLayoutClient: () => Promise.reject(new Error("no worker")), confirm: () => true },
      { onAccepted: vi.fn() },
    );
    void runner.runNow("edit", "user");
    await flush();
    expect(state.run.value).toEqual({ status: "error", message: "no worker" });
  });
});

describe("runner guards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("discards a result for inputs edited without schedule()", async () => {
    const { state, stub, runner, onAccepted } = setup();
    void runner.runNow("edit", "user");
    await flush();
    const call = stub.calls[0];
    if (!call) {
      throw new Error("no run");
    }
    bumpHeight(state);
    call.resolve(makeResult(makeLayout(call.input.inputsHash)));
    await flush();
    expect(state.project.value.layout).toBeUndefined();
    expect(state.run.value).toEqual({ status: "idle" });
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("schedule() during a run cancels it and ignores its later progress", async () => {
    const { state, stub, runner } = setup();
    void runner.runNow("edit", "user");
    await flush();
    const cancels = stub.cancelCount();
    runner.schedule();
    expect(stub.cancelCount()).toBeGreaterThan(cancels);
    expect(state.run.value).toEqual({ status: "idle" });
    stub.calls[0]?.onProgress(50, 100, makeResult(null));
    expect(state.run.value).toEqual({ status: "idle" });
  });

  it("dispose() clears a pending debounce timer", async () => {
    const { stub, runner } = setup();
    runner.schedule();
    runner.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await flush();
    expect(stub.calls).toHaveLength(0);
  });

  it("dispose() while the client loads disposes it, stops the run and blocks later runs", async () => {
    const state = createState(fixtureProject());
    const stub = stubLayoutClient();
    let release: (c: LayoutClient) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<LayoutClient>((resolve) => {
          release = resolve;
        }),
    );
    const runner = createRunner(
      state,
      { loadLayoutClient: load, confirm: () => true },
      { onAccepted: vi.fn() },
    );
    void runner.runNow("edit", "user");
    await flush();
    expect(state.run.value.status).toBe("running");
    runner.dispose();
    expect(state.run.value).toEqual({ status: "idle" });
    release(stub.client);
    await flush();
    expect(stub.disposed()).toBe(true);
    expect(stub.calls).toHaveLength(0);
    expect(state.run.value).toEqual({ status: "idle" });
    // after dispose nothing starts again
    void runner.runNow("edit", "user");
    runner.schedule();
    runner.afterOpen();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(state.run.value).toEqual({ status: "idle" });
  });
});
