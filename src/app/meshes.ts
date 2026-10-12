// src/app/meshes.ts
import type { Mesh } from "../geometry/types";
import type { Settings, TraySpec } from "../model/types";
import type { GeometryClient } from "./clients";
import { unsupportedReason } from "./support";

export interface BuiltMesh {
  mesh: Mesh;
  volumeMm3: number;
}

export class UnsupportedTrayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedTrayError";
  }
}

export interface MeshSource {
  get(spec: TraySpec, settings: Settings, signal?: AbortSignal): Promise<BuiltMesh>;
  /** Forget cached meshes and failed specs (Retry after a failure). */
  reset(): void;
  /**
   * Take the given specs off the failed list, so asking for them builds them again; the cached
   * meshes of every other spec stay.
   */
  forget(specs: readonly TraySpec[], settings: Settings): void;
  dispose(): void;
}

export const MESH_CACHE_LIMIT = 64;

/**
 * Builds in the geometry worker at a time. The worker runs one build at a time and
 * BUILD_TIMEOUT_MS counts queue time, so the rest wait here (roadmap §4.3).
 */
export const MAX_IN_FLIGHT = 2;

function abortError(): Error {
  const error = new Error("cancelled");
  error.name = "AbortError";
  return error;
}

/**
 * A caller that shares someone else's build stops waiting when its own signal aborts; the build
 * itself goes on for the others (it is cancelled only by the signal of the caller that started it).
 */
function rejectOnAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function isNamed(e: unknown, name: string): boolean {
  return e instanceof Error && e.name === name;
}

export function createMeshSource(load: () => Promise<GeometryClient>): MeshSource {
  let client: Promise<GeometryClient> | null = null;
  const cache = new Map<string, Promise<BuiltMesh>>();
  // Roadmap §4.3: a spec that fails twice is not built again until reset(), so a spec that kills
  // the worker can't keep restarting it.
  const failures = new Map<string, number>();
  const failed = new Map<string, unknown>();
  let inFlight = 0;
  const waiting: { start: () => void }[] = [];

  /** Waits for a free build slot; rejects when the signal aborts first. */
  function acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(abortError());
    }
    if (inFlight < MAX_IN_FLIGHT) {
      inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entry = {
        start: () => {
          signal?.removeEventListener("abort", onAbort);
          inFlight += 1;
          resolve();
        },
      };
      const onAbort = (): void => {
        const i = waiting.indexOf(entry);
        if (i >= 0) {
          waiting.splice(i, 1);
        }
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      waiting.push(entry);
    });
  }

  function release(): void {
    inFlight -= 1;
    waiting.shift()?.start();
  }

  async function buildOnce(
    spec: TraySpec,
    settings: Settings,
    signal?: AbortSignal,
  ): Promise<BuiltMesh> {
    const c = await getClient();
    await acquire(signal);
    try {
      return await c.build(spec, settings, signal);
    } finally {
      release();
    }
  }

  /**
   * One build, retried once when the worker died under it (restarted while the build waited, or
   * crashed, maybe because of another build). Failures in a row count toward `failed`; a success
   * clears the count.
   */
  async function build(
    key: string,
    spec: TraySpec,
    settings: Settings,
    signal?: AbortSignal,
  ): Promise<BuiltMesh> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const built = await buildOnce(spec, settings, signal);
        failures.delete(key);
        return built;
      } catch (error) {
        if (isNamed(error, "AbortError")) {
          throw error;
        }
        const count = (failures.get(key) ?? 0) + 1;
        failures.set(key, count);
        if (count >= 2) {
          failed.set(key, error);
          throw error;
        }
        const workerDied = isNamed(error, "WorkerRestartedError") || isNamed(error, "WorkerError");
        if (attempt > 0 || !workerDied) {
          throw error;
        }
      }
    }
  }

  function getClient(): Promise<GeometryClient> {
    if (!client) {
      const loading = load();
      loading.catch(() => {
        if (client === loading) {
          client = null;
        }
      });
      client = loading;
    }
    return client;
  }

  /** The cached (or a new) build of a spec; the signal of the caller that started it applies. */
  function shared(
    key: string,
    spec: TraySpec,
    settings: Settings,
    signal?: AbortSignal,
  ): Promise<BuiltMesh> {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const built = build(key, spec, settings, signal);
    cache.set(key, built);
    built.catch(() => {
      if (cache.get(key) === built) {
        cache.delete(key);
      }
    });
    while (cache.size > MESH_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cache.delete(oldest);
    }
    return built;
  }

  const source: MeshSource = {
    get(spec, settings, signal) {
      const reason = unsupportedReason(spec);
      if (reason !== null) {
        return Promise.reject(new UnsupportedTrayError(reason));
      }
      const key = JSON.stringify([spec, settings]);
      if (failed.has(key)) {
        return Promise.reject(failed.get(key));
      }
      // Another caller's abort must not fail this one: an aborted build has left the cache, so
      // asking again starts a new one.
      const result = shared(key, spec, settings, signal).catch((error: unknown) =>
        isNamed(error, "AbortError") && signal?.aborted !== true
          ? source.get(spec, settings, signal)
          : Promise.reject(error),
      );
      return rejectOnAbort(result, signal);
    },
    forget(specs, settings) {
      for (const spec of specs) {
        const key = JSON.stringify([spec, settings]);
        failures.delete(key);
        failed.delete(key);
      }
    },
    reset() {
      cache.clear();
      failures.clear();
      failed.clear();
    },
    dispose() {
      cache.clear();
      const current = client;
      client = null;
      void current?.then(
        (c) => c.dispose(),
        () => undefined,
      );
    },
  };
  return source;
}
