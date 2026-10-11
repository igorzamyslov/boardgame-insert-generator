import type { ManifoldToplevel } from "manifold-3d";
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
      post({ type: "error", requestId, key: spec.key, ...describeFailure(err) }, []);
    }
  };
}
