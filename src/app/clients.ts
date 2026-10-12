// src/app/clients.ts
import type { GeometryClient } from "../geometry/client";
import type { LayoutClient } from "../layout/client";

export type { GeometryClient, LayoutClient };

/** Loaded on demand so the worker plumbing is a separate chunk. */
export async function loadLayoutClient(): Promise<LayoutClient> {
  const mod = await import("../layout/client");
  return mod.createLayoutClient();
}

/** Loaded on demand: the geometry worker pulls in manifold's WASM. */
export async function loadGeometryClient(): Promise<GeometryClient> {
  const mod = await import("../geometry/client");
  return mod.createGeometryClient();
}
