import type { ManifoldToplevel } from "manifold-3d";
import type { GeometryRequest, GeometryResponse } from "./types";
import { buildTray } from "./tray";

export type PostResponse = (message: GeometryResponse, transfer: Transferable[]) => void;

// Message handler shared by the real worker and tests. Builds run one after
// another; a "cancel" only skips a build that has not started yet (builds
// are synchronous, so in practice: one still waiting for the WASM to load).
export function createGeometryHandler(
  load: () => Promise<ManifoldToplevel>,
  post: PostResponse,
): (request: GeometryRequest) => Promise<void> {
  const cancelled = new Set<number>();
  return async (request) => {
    if (request.type === "cancel") {
      cancelled.add(request.requestId);
      return;
    }
    const { requestId, spec, settings } = request;
    try {
      const m = await load();
      if (cancelled.delete(requestId)) {
        return;
      }
      const { mesh, volumeMm3 } = buildTray(m, spec, settings);
      post({ type: "built", requestId, key: spec.key, mesh, volumeMm3 }, [
        mesh.positions.buffer as ArrayBuffer,
        mesh.indices.buffer as ArrayBuffer,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "error", requestId, key: spec.key, message }, []);
    }
  };
}
