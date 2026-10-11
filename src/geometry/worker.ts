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
  void handle(event.data);
});
