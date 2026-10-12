import { nextMacrotask } from "../util/macrotask";
import { createRun } from "./optimize";
import type { LayoutRequest, LayoutResponse } from "./types";

/**
 * Message handling of the layout worker, separated from `self` so it can be tested.
 * Runs one chunk at a time and yields to the event loop between chunks, so "cancel"
 * messages (and newer "run" messages, which supersede older runs) are seen promptly.
 */
export function createWorkerHandler(
  post: (msg: LayoutResponse) => void,
  yieldToEvents: () => Promise<void> = nextMacrotask,
): (req: LayoutRequest) => Promise<void> {
  const cancelled = new Set<number>();
  let active = -1;
  const stopped = (runId: number): boolean => cancelled.has(runId) || active !== runId;
  return async (req) => {
    if (req.type === "cancel") {
      cancelled.add(req.runId);
      return;
    }
    const { runId } = req;
    active = runId;
    try {
      const run = createRun(req.input, req.seed, req.iterations, { warmStart: req.warmStart });
      for (;;) {
        const finished = run.step();
        if (stopped(runId)) {
          return;
        }
        if (finished) {
          break;
        }
        post({ type: "progress", runId, done: run.done, total: run.total, best: run.snapshot() });
        await yieldToEvents();
        if (stopped(runId)) {
          return;
        }
      }
      post({ type: "done", runId, result: run.result() });
    } catch (e) {
      post({ type: "error", runId, message: e instanceof Error ? e.message : String(e) });
    } finally {
      cancelled.delete(runId);
    }
  };
}
