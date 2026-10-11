import type { ManifoldToplevel } from "manifold-3d";
import type { Settings, TraySpec } from "../model/types";
import type { GeometryRequest, GeometryResponse } from "./types";
import { UnsupportedFeatureError } from "./errors";
import { buildTray } from "./tray";

export type PostResponse = (message: GeometryResponse, transfer: Transferable[]) => void;

type Failure = Extract<GeometryResponse, { type: "error" }>;

// What an error response says about a thrown value. The error's name and
// feature survive the worker boundary; a non-Error throw (the WASM runtime
// throws exception pointers as numbers) is stringified into something useful.
function describeFailure(thrown: unknown): Pick<Failure, "message" | "name" | "feature"> {
  if (thrown instanceof UnsupportedFeatureError) {
    return { message: thrown.message, name: thrown.name, feature: thrown.feature };
  }
  if (thrown instanceof Error) {
    return { message: thrown.message, name: thrown.name };
  }
  if (typeof thrown === "number") {
    return { message: `WASM error ${thrown}` };
  }
  if (typeof thrown === "object" && thrown !== null) {
    try {
      const json = JSON.stringify(thrown);
      if (typeof json === "string") {
        return { message: json };
      }
    } catch {
      // Cyclic or otherwise unserialisable: fall through to String().
    }
  }
  return { message: String(thrown) };
}

interface Job {
  requestId: number;
  spec: TraySpec;
  settings: Settings;
  finish: () => void;
  fail: (error: unknown) => void;
}

// Lets the worker's event loop deliver messages (a "cancel", say) that arrived
// while the previous build was running.
function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// Message handler shared by the real worker and tests.
//
// Builds are queued and run one at a time, with a macrotask between them, so a
// "cancel" for a queued build is seen before that build starts. A cancelled
// build is answered with an AbortError response. (A build that has started
// runs to the end: builds are synchronous, so the only wait that a cancel can
// interrupt is the WASM load.) The promise a "build" returns settles when
// that build has been answered; it rejects only if a response could not be
// posted, and the worker turns that into an uncaught error.
export function createGeometryHandler(
  load: () => Promise<ManifoldToplevel>,
  post: PostResponse,
): (request: GeometryRequest) => Promise<void> {
  const queue: Job[] = [];
  const inFlight = new Set<number>(); // queued or running builds
  const cancelled = new Set<number>(); // always a subset of inFlight
  let draining = false;

  async function run({ requestId, spec, settings }: Job): Promise<void> {
    try {
      if (!cancelled.has(requestId)) {
        const m = await load();
        if (!cancelled.has(requestId)) {
          const { mesh, volumeMm3 } = buildTray(m, spec, settings);
          post({ type: "built", requestId, key: spec.key, mesh, volumeMm3 }, [
            mesh.positions.buffer as ArrayBuffer,
            mesh.indices.buffer as ArrayBuffer,
          ]);
          return;
        }
      }
      post(
        { type: "error", requestId, key: spec.key, name: "AbortError", message: "cancelled" },
        [],
      );
    } catch (err) {
      post({ type: "error", requestId, key: spec.key, ...describeFailure(err) }, []);
    }
  }

  async function drain(): Promise<void> {
    draining = true;
    for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
      await nextMacrotask();
      try {
        await run(job);
        job.finish();
      } catch (err) {
        job.fail(err);
      } finally {
        inFlight.delete(job.requestId);
        cancelled.delete(job.requestId);
      }
    }
    draining = false;
  }

  return async (request) => {
    if (request.type === "cancel") {
      if (inFlight.has(request.requestId)) {
        cancelled.add(request.requestId);
      }
      return;
    }
    const { requestId, spec, settings } = request;
    await new Promise<void>((finish, fail) => {
      inFlight.add(requestId);
      queue.push({ requestId, spec, settings, finish, fail });
      if (!draining) {
        void drain();
      }
    });
  };
}
