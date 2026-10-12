// src/app/runner.ts
import { batch } from "@preact/signals";
import { DEFAULT_ITERATIONS } from "../layout";
import type { LayoutInput, LayoutResult } from "../layout/types";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { validateProject } from "../model/validate";
import { APP_VERSION } from "../model/version";
import { size } from "../sizing";
import { errorText } from "../util/errors";
import { pruneDroppedLocks } from "./actions";
import type { LayoutClient } from "./clients";
import type { RunKind, State } from "./state";

export const DEBOUNCE_MS = 400;
export const DEFAULT_SEED = 1;
export const IMPROVE_FACTOR = 3;
export const NEWER_MINOR_CONFIRM =
  "This project was made with a newer app version. Re-optimizing replaces its stored layout and may drop parts this version doesn't understand. Continue?";

export type RunTrigger = "auto" | "user";

/** `LayoutCancelledError.name` (plan 4 `layout/client.ts`); matched by name so this module
 * doesn't import the client statically (it is loaded lazily). */
export const CANCELLED_ERROR_NAME = "LayoutCancelledError";

export interface RunnerDeps {
  loadLayoutClient: () => Promise<LayoutClient>;
  confirm: (message: string) => boolean;
}

export interface RunnerHooks {
  onAccepted: () => void;
}

export interface Runner {
  schedule(): void;
  runNow(kind: RunKind, trigger: RunTrigger): Promise<void>;
  cancel(): void;
  retry(): Promise<void>;
  afterOpen(): void;
  dispose(): void;
}

export function canOptimize(p: Project): boolean {
  return p.components.length > 0 && !validateProject(p).some((n) => n.level === "error");
}

export function buildLayoutInput(p: Project): LayoutInput {
  const { requirements } = size(p.components, p.settings);
  return {
    requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: APP_VERSION,
  };
}

export function createRunner(state: State, deps: RunnerDeps, hooks: RunnerHooks): Runner {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let token = 0;
  let lastKind: RunKind = "edit";
  let clientPromise: Promise<LayoutClient> | null = null;
  let client: LayoutClient | null = null;
  let disposed = false;

  function getClient(): Promise<LayoutClient> {
    if (!clientPromise) {
      const loading = deps.loadLayoutClient().then((c) => {
        if (disposed) {
          // dispose() came while the worker was loading: nobody will use this client.
          c.dispose();
        } else {
          client = c;
        }
        return c;
      });
      loading.catch(() => {
        clientPromise = null;
      });
      clientPromise = loading;
    }
    return clientPromise;
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  /** Make every in-flight run stale and ask the worker to stop it. */
  function invalidate(): void {
    token += 1;
    if (client) {
      client.cancel();
    }
  }

  function accept(result: LayoutResult): void {
    const current = state.project.value;
    // Locks the run dropped leave the project in the same update, so the plan view and the
    // inputs hash match what was laid out. The layout ignored them, so it is valid for the
    // pruned inputs: it is stored under the post-prune hash, so it doesn't look stale and
    // nothing re-runs. lastResult keeps pointing at the stored layout (its notices stay shown).
    const pruned = pruneDroppedLocks(current, result.notices);
    const accepted: LayoutResult =
      pruned !== current && result.layout
        ? { ...result, layout: { ...result.layout, inputsHash: inputsHash(pruned) } }
        : result;
    batch(() => {
      state.lastResult.value = accepted;
      state.lastResultHash.value = inputsHash(pruned);
      if (accepted.layout) {
        state.undoSlot.value = current.layout
          ? { layout: current.layout, ...(pruned !== current && { locks: current.locks }) }
          : null;
        state.project.value = { ...pruned, layout: accepted.layout };
      } else if (pruned !== current) {
        state.project.value = pruned;
      }
      state.run.value = { status: "done" };
    });
    if (accepted.layout || pruned !== current) {
      hooks.onAccepted();
    }
  }

  async function runNow(kind: RunKind, trigger: RunTrigger): Promise<void> {
    if (disposed) {
      return;
    }
    clearTimer();
    const p = state.project.value;
    if (!canOptimize(p)) {
      invalidate();
      state.run.value = { status: "idle" };
      return;
    }
    if (state.needsConfirm.value) {
      if (trigger === "auto" || !deps.confirm(NEWER_MINOR_CONFIRM)) {
        return;
      }
      state.needsConfirm.value = false;
    }
    invalidate();
    const my = token;
    lastKind = kind;
    const previous = p.layout;
    const seed = previous?.seed ?? DEFAULT_SEED;
    // This run's budget. With the stored layout as warm start the layout engine continues
    // from it and stores previous.iterations + this budget (spec §7.2 "improve more adds 3N").
    const iterations =
      kind === "improve" && previous ? IMPROVE_FACTOR * DEFAULT_ITERATIONS : DEFAULT_ITERATIONS;
    state.run.value = { status: "running", done: 0, total: iterations };
    try {
      const input = buildLayoutInput(p);
      const c = await getClient();
      if (my !== token) {
        return;
      }
      const result = await c.run(input, seed, iterations, previous, (done, total) => {
        if (my === token) {
          state.run.value = { status: "running", done, total };
        }
      });
      if (my !== token) {
        return;
      }
      if (inputsHash(state.project.value) !== input.inputsHash) {
        state.run.value = { status: "idle" };
        return;
      }
      accept(result);
    } catch (e) {
      if (my !== token) {
        return;
      }
      if (e instanceof Error && e.name === CANCELLED_ERROR_NAME) {
        state.run.value = { status: "idle" };
        return;
      }
      state.run.value = { status: "error", message: errorText(e) };
    }
  }

  return {
    schedule() {
      if (disposed) {
        return;
      }
      clearTimer();
      invalidate();
      if (state.run.value.status === "running") {
        state.run.value = { status: "idle" };
      }
      timer = setTimeout(() => {
        timer = undefined;
        void runNow("edit", "auto");
      }, DEBOUNCE_MS);
    },
    runNow,
    cancel() {
      clearTimer();
      invalidate();
      state.run.value = { status: "idle" };
    },
    retry() {
      return runNow(lastKind, "user");
    },
    afterOpen() {
      if (disposed) {
        return;
      }
      clearTimer();
      invalidate();
      if (!state.project.value.layout) {
        void runNow("edit", "auto");
      }
    },
    dispose() {
      disposed = true;
      clearTimer();
      invalidate();
      if (state.run.value.status === "running") {
        state.run.value = { status: "idle" };
      }
      client?.dispose();
      client = null;
      clientPromise = null;
    },
  };
}
