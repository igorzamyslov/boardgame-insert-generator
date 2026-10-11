import type { Settings, TraySpec } from "../model/types";
import type { GeometryRequest, GeometryResponse, Mesh } from "./types";

export interface GeometryClient {
  build(spec: TraySpec, settings: Settings): Promise<{ mesh: Mesh; volumeMm3: number }>;
  dispose(): void;
}

interface Pending {
  resolve: (result: { mesh: Mesh; volumeMm3: number }) => void;
  reject: (error: Error) => void;
}

// Main-thread side of the geometry worker. The worker (and the WASM) is
// started on the first build. If the worker crashes, every pending build is
// rejected and the next build starts a fresh worker (retry).
export function createGeometryClient(): GeometryClient {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function failAll(error: Error): void {
    const waiting = [...pending.values()];
    pending.clear();
    for (const p of waiting) {
      p.reject(error);
    }
  }

  function onMessage(event: MessageEvent<GeometryResponse>): void {
    const response = event.data;
    const p = pending.get(response.requestId);
    if (p === undefined) {
      return;
    }
    pending.delete(response.requestId);
    if (response.type === "built") {
      p.resolve({ mesh: response.mesh, volumeMm3: response.volumeMm3 });
    } else {
      p.reject(new Error(response.message));
    }
  }

  function ensureWorker(): Worker {
    if (worker !== null) {
      return worker;
    }
    const created = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    created.addEventListener("message", onMessage);
    created.addEventListener("error", (event: ErrorEvent) => {
      event.preventDefault();
      created.terminate();
      if (worker === created) {
        worker = null;
      }
      failAll(new Error(`Geometry worker failed: ${event.message || "unknown error"}`));
    });
    worker = created;
    return created;
  }

  return {
    build(spec, settings) {
      return new Promise((resolve, reject) => {
        const requestId = nextId;
        nextId += 1;
        pending.set(requestId, { resolve, reject });
        const request: GeometryRequest = { type: "build", requestId, spec, settings };
        ensureWorker().postMessage(request);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll(new Error("Geometry client disposed"));
    },
  };
}
