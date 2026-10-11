import type { Settings, TraySpec } from "../model/types";
import type { GeometryRequest, GeometryResponse, Mesh } from "./types";

export interface GeometryClient {
  // Rejects with a GeometryBuildError when the build fails, the signal aborts
  // it, or it takes longer than BUILD_TIMEOUT_MS.
  build(
    spec: TraySpec,
    settings: Settings,
    signal?: AbortSignal,
  ): Promise<{ mesh: Mesh; volumeMm3: number }>;
  // Terminal: stops the worker and rejects pending and later builds.
  dispose(): void;
}

// How long one build may take, from the call to build() to the answer. It
// covers waiting behind earlier builds and the one-off WASM load (a few
// seconds on a slow phone), not just the geometry. A worker that has not
// answered by then is presumed stuck, so it is terminated and replaced.
export const BUILD_TIMEOUT_MS = 30_000;

// Why a build failed. `name` is the reason: the thrown error's name in the
// worker ("TraySpecError" for an invalid spec, "UnsupportedFeatureError" with its
// `feature` for a tray from a newer app version), or one the client makes up:
// "AbortError", "TimeoutError", "WorkerError" (the worker crashed) and
// "WorkerRestartedError" (it was replaced while this build waited). Defined
// here, not in the kernel, so the main thread never imports geometry code.
export class GeometryBuildError extends Error {
  readonly feature: string | undefined;

  constructor(message: string, reason: string, options?: { feature?: string; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = reason;
    this.feature = options?.feature;
  }
}

// Failures that say something about one spec, not about the worker: the worker
// stays up after them. Any other failure (a kernel failure, a runtime
// RangeError from the WASM heap, a bug) means the WASM heap cannot be
// trusted, so the worker is replaced.
const SPEC_FAILURES: ReadonlySet<string> = new Set([
  "TraySpecError",
  "UnsupportedFeatureError",
  "AbortError",
]);

interface Pending {
  resolve: (result: { mesh: Mesh; volumeMm3: number }) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  release: () => void; // detaches the abort listener
}

function abortError(): GeometryBuildError {
  return new GeometryBuildError("cancelled", "AbortError");
}

// Main-thread side of the geometry worker. The worker (and the WASM) is
// started on the first build. If the worker crashes, hangs or hits a kernel
// failure, the builds waiting for it are rejected and the next build starts a
// fresh worker (retry).
export function createGeometryClient(): GeometryClient {
  let worker: Worker | null = null;
  let disposed = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  // Removes a build from the pending set (and its timer and abort listener).
  function take(requestId: number): Pending | undefined {
    const p = pending.get(requestId);
    if (p !== undefined) {
      pending.delete(requestId);
      clearTimeout(p.timer);
      p.release();
    }
    return p;
  }

  function failAll(error: Error): void {
    for (const requestId of [...pending.keys()]) {
      take(requestId)?.reject(error);
    }
  }

  // Terminates a worker that can no longer be trusted. Builds still waiting
  // for it cannot be answered, so they are rejected as well.
  function retire(retired: Worker, error: Error): void {
    retired.terminate();
    if (worker === retired) {
      worker = null;
    }
    failAll(error);
  }

  function restartedError(why: string): GeometryBuildError {
    return new GeometryBuildError(`Geometry worker restarted ${why}`, "WorkerRestartedError");
  }

  function ensureWorker(): Worker {
    if (worker !== null) {
      return worker;
    }
    const created = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    // A worker that has been replaced may still deliver events it queued.
    const current = (): boolean => worker === created;
    const crashed = (why: string, cause: unknown): void => {
      if (current()) {
        retire(
          created,
          new GeometryBuildError(`Geometry worker failed: ${why}`, "WorkerError", { cause }),
        );
      }
    };
    created.addEventListener("message", (event: MessageEvent<GeometryResponse>) => {
      if (!current()) {
        return;
      }
      const response = event.data;
      const p = take(response.requestId);
      if (p === undefined) {
        return;
      }
      if (response.type === "built") {
        p.resolve({ mesh: response.mesh, volumeMm3: response.volumeMm3 });
        return;
      }
      const error = new GeometryBuildError(response.message, response.name ?? "Error", {
        feature: response.feature,
      });
      p.reject(error);
      if (!SPEC_FAILURES.has(error.name)) {
        retire(created, restartedError("after a kernel failure"));
      }
    });
    created.addEventListener("error", (event: ErrorEvent) => {
      event.preventDefault();
      const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
      crashed(`${event.message || "unknown error"}${where}`, event);
    });
    created.addEventListener("messageerror", (event: MessageEvent) => {
      crashed("a message could not be deserialised", event);
    });
    worker = created;
    return created;
  }

  return {
    build(spec, settings, signal) {
      if (disposed) {
        return Promise.reject(new Error("Geometry client disposed"));
      }
      if (signal?.aborted === true) {
        return Promise.reject(abortError());
      }
      return new Promise((resolve, reject) => {
        const requestId = nextId;
        nextId += 1;
        const request: GeometryRequest = { type: "build", requestId, spec, settings };
        // Sent before the build is registered, so a worker that cannot be
        // created or posted to leaves nothing pending.
        let target: Worker;
        try {
          target = ensureWorker();
          target.postMessage(request);
        } catch (cause) {
          const why = cause instanceof Error ? cause.message : String(cause);
          reject(
            new GeometryBuildError(`Geometry worker unavailable: ${why}`, "WorkerError", { cause }),
          );
          return;
        }
        const onAbort = (): void => {
          if (take(requestId) !== undefined) {
            reject(abortError());
            try {
              target.postMessage({ type: "cancel", requestId } satisfies GeometryRequest);
            } catch {
              // Best effort: the build is already rejected, and a worker that
              // misses the cancel only finishes a build nobody waits for.
            }
          }
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => {
          if (take(requestId) !== undefined) {
            reject(
              new GeometryBuildError(
                `Geometry build did not finish within ${BUILD_TIMEOUT_MS / 1000} s`,
                "TimeoutError",
              ),
            );
            retire(target, restartedError("after a build timed out"));
          }
        }, BUILD_TIMEOUT_MS);
        pending.set(requestId, {
          resolve,
          reject,
          timer,
          release: () => signal?.removeEventListener("abort", onAbort),
        });
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      failAll(new Error("Geometry client disposed"));
    },
  };
}
