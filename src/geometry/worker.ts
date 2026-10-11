// Geometry Web Worker. Loaded lazily by client.ts via
// new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }).
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { loadManifold } from "./load";
import { createGeometryHandler } from "./worker-core";
import type { GeometryRequest } from "./types";

const handle = createGeometryHandler(
  () => loadManifold(wasmUrl),
  (message, transfer) => {
    self.postMessage(message, { transfer });
  },
);

self.addEventListener("message", (event: MessageEvent<GeometryRequest>) => {
  handle(event.data).catch((err: unknown) => {
    // A malformed request, or a response that could not be posted: nothing
    // can answer that request, so raise an uncaught error. The client's
    // "error" listener rejects its pending builds and restarts the worker.
    setTimeout(() => {
      throw err;
    }, 0);
  });
});
