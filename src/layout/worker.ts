import type { LayoutRequest, LayoutResponse } from "./types";
import { createWorkerHandler } from "./worker-core";

interface WorkerScope {
  onmessage: ((e: MessageEvent<LayoutRequest>) => void) | null;
  postMessage(msg: LayoutResponse): void;
}

const scope = self as unknown as WorkerScope;
const handle = createWorkerHandler((msg) => scope.postMessage(msg));
scope.onmessage = (e) => {
  void handle(e.data);
};
