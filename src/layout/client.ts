import type { StoredLayout } from "../model/types";
import type { LayoutInput, LayoutRequest, LayoutResponse, LayoutResult } from "./types";

/** Rejection reason of a run that was cancelled or superseded by a newer run. */
export class LayoutCancelledError extends Error {
  constructor() {
    super("Layout run cancelled");
    this.name = "LayoutCancelledError";
  }
}

/** The part of the Worker API the client uses (a fake in tests). */
export interface WorkerLike {
  postMessage(msg: LayoutRequest): void;
  onmessage: ((e: MessageEvent<LayoutResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  terminate(): void;
}

export interface LayoutClient {
  run(
    input: LayoutInput,
    seed: number,
    iterations: number,
    warmStart: StoredLayout | undefined,
    onProgress: (done: number, total: number, best: LayoutResult) => void,
  ): Promise<LayoutResult>;
  cancel(): void;
  dispose(): void;
}

interface Pending {
  readonly id: number;
  resolve(r: LayoutResult): void;
  reject(e: Error): void;
  onProgress(done: number, total: number, best: LayoutResult): void;
}

/**
 * One lazily created worker, one run at a time. Starting a run cancels the previous one;
 * a cancelled run's promise rejects with LayoutCancelledError and its late messages are
 * ignored. A worker crash rejects the run and the next run starts a fresh worker.
 */
export function createLayoutClientWith(factory: () => WorkerLike): LayoutClient {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  let pending: Pending | null = null;

  const settle = (): Pending | null => {
    const p = pending;
    pending = null;
    return p;
  };
  const onMessage = (msg: LayoutResponse): void => {
    if (!pending || msg.runId !== pending.id) {
      return;
    }
    if (msg.type === "progress") {
      pending.onProgress(msg.done, msg.total, msg.best);
    } else if (msg.type === "done") {
      settle()?.resolve(msg.result);
    } else {
      settle()?.reject(new Error(msg.message));
    }
  };
  const ensure = (): WorkerLike => {
    if (worker) {
      return worker;
    }
    const w = factory();
    w.onmessage = (e) => onMessage(e.data);
    w.onerror = (e) => {
      w.terminate();
      worker = null;
      settle()?.reject(new Error(e.message || "Layout worker failed"));
    };
    worker = w;
    return w;
  };
  const cancel = (): void => {
    const p = settle();
    if (p) {
      worker?.postMessage({ type: "cancel", runId: p.id });
      p.reject(new LayoutCancelledError());
    }
  };
  return {
    run(input, seed, iterations, warmStart, onProgress) {
      cancel();
      nextId++;
      const id = nextId;
      return new Promise<LayoutResult>((resolve, reject) => {
        pending = { id, resolve, reject, onProgress };
        ensure().postMessage({ type: "run", runId: id, input, seed, iterations, warmStart });
      });
    },
    cancel,
    dispose() {
      cancel();
      worker?.terminate();
      worker = null;
    },
  };
}

export function createLayoutClient(): LayoutClient {
  return createLayoutClientWith(
    () =>
      new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      }) as unknown as WorkerLike,
  );
}
