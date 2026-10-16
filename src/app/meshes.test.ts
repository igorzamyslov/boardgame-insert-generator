// src/app/meshes.test.ts
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { FeatureSpec } from "../model/types";
import { GeometryBuildError } from "../geometry/client";
import type { GeometryClient } from "./clients";
import { MAX_IN_FLIGHT, MESH_CACHE_LIMIT, UnsupportedTrayError, createMeshSource } from "./meshes";
import { buildErrorReason, isInvalidSpec, unsupportedReason } from "./support";
import { cubeMesh, makeTray } from "./test-helpers";

function fakeClient() {
  const build = vi.fn<GeometryClient["build"]>(() =>
    Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
  );
  const dispose = vi.fn();
  const client: GeometryClient = { build, dispose };
  return { client, build, dispose };
}

const magnet = makeTray({
  key: "m:p0:0",
  compartments: [
    {
      x: 2,
      y: 2,
      w: 10,
      d: 10,
      floorZ: 1.2,
      kind: "well",
      contents: "M",
      features: [{ type: "magnet" } as unknown as FeatureSpec],
    },
  ],
});

describe("unsupportedReason / buildErrorReason", () => {
  it("flags unknown features and accepts known trays", () => {
    expect(unsupportedReason(makeTray())).toBeNull();
    expect(unsupportedReason(magnet)).toBe('Uses feature "magnet" from a newer app version.');
  });

  it("holds a merged part to what its members can be built with", () => {
    const filler = makeTray({ key: "leftover:0", part: "leftover", compartments: [] });
    const merged = (...members: ReturnType<typeof makeTray>[]) =>
      makeTray({
        key: "merged:0",
        part: "leftover",
        compartments: [],
        merged: { members, bridges: [], flipped: false },
      });
    expect(unsupportedReason(merged(filler, filler))).toBeNull();
    expect(unsupportedReason(merged(filler, magnet))).toBe(
      'Uses feature "magnet" from a newer app version.',
    );
  });

  it("turns build errors into readable reasons by their name", () => {
    const unsupported = new GeometryBuildError(
      'Unsupported tray feature "lid": this tray was made with a newer app version',
      "UnsupportedFeatureError",
      { feature: "lid" },
    );
    expect(buildErrorReason(unsupported)).toBe('Uses feature "lid" from a newer app version.');
    const invalid = new GeometryBuildError("Tray a:p0:0: compartments overlap", "TraySpecError");
    expect(buildErrorReason(invalid)).toBe("Tray a:p0:0: compartments overlap");
    expect(isInvalidSpec(invalid)).toBe(true);
    // A RangeError from elsewhere (the WASM heap) is not a verdict on the spec.
    expect(isInvalidSpec(new RangeError("Tray a:p0:0: out of memory"))).toBe(false);
    expect(buildErrorReason(new GeometryBuildError("slow", "TimeoutError"))).toBe(
      "Building this tray took too long.",
    );
    expect(buildErrorReason(new GeometryBuildError("cancelled", "AbortError"))).toBe("Cancelled.");
    expect(buildErrorReason("boom")).toBe("boom");
  });
});

describe("createMeshSource", () => {
  it("builds each spec once and loads the client lazily", async () => {
    const f = fakeClient();
    const load = vi.fn(() => Promise.resolve(f.client));
    const source = createMeshSource(load);
    expect(load).not.toHaveBeenCalled();
    const t = makeTray();
    await source.get(t, DEFAULT_SETTINGS);
    await source.get({ ...t }, DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(1);
    await source.get(t, { ...DEFAULT_SETTINGS, wall: 2 });
    expect(f.build).toHaveBeenCalledTimes(2);
  });

  it("rebuilds a part when its name changes", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    const t = makeTray();
    await source.get({ ...t, partName: "Cards" }, DEFAULT_SETTINGS);
    await source.get({ ...t, partName: "Cards" }, DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(1);
    // another name is other engraving: another mesh; and no name at all is the plain part
    await source.get({ ...t, partName: "Dice" }, DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(2);
    await source.get(t, DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(3);
    expect(f.build.mock.calls.map(([spec]) => spec.partName)).toEqual(["Cards", "Dice", undefined]);
  });

  it("rejects unsupported trays without building them", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    await expect(source.get(magnet, DEFAULT_SETTINGS)).rejects.toBeInstanceOf(UnsupportedTrayError);
    expect(f.build).not.toHaveBeenCalled();
  });

  it("does not cache failures, so a retry builds again", async () => {
    const f = fakeClient();
    f.build.mockRejectedValueOnce(new Error("Geometry worker failed: oom"));
    const source = createMeshSource(() => Promise.resolve(f.client));
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow(/oom/);
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
    expect(f.build).toHaveBeenCalledTimes(2);
  });

  it("retries a build once when the worker was restarted under it or crashed", async () => {
    for (const reason of ["WorkerRestartedError", "WorkerError"]) {
      const f = fakeClient();
      f.build.mockRejectedValueOnce(new GeometryBuildError("worker gone", reason));
      const source = createMeshSource(() => Promise.resolve(f.client));
      await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
      expect(f.build).toHaveBeenCalledTimes(2);
    }
  });

  it("clears a spec's failure count when it builds", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    const fail = (): void => {
      f.build.mockRejectedValueOnce(new GeometryBuildError("Tray t: bad", "TraySpecError"));
    };
    fail();
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow("bad");
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
    // Evict its mesh from the cache, so the next get builds it again.
    for (let i = 0; i < MESH_CACHE_LIMIT; i += 1) {
      await source.get(makeTray({ key: `other${i}` }), DEFAULT_SETTINGS);
    }
    fail();
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow("bad");
    // One failure since the success: not marked failed, so it builds again.
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
    expect(f.build).toHaveBeenCalledTimes(MESH_CACHE_LIMIT + 4);
  });

  it("marks a spec that fails twice as failed until reset, so it can't livelock the worker", async () => {
    const f = fakeClient();
    f.build.mockRejectedValueOnce(new GeometryBuildError("restarted", "WorkerRestartedError"));
    f.build.mockRejectedValueOnce(new GeometryBuildError("too slow", "TimeoutError"));
    const source = createMeshSource(() => Promise.resolve(f.client));
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow("too slow");
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).rejects.toThrow("too slow");
    expect(f.build).toHaveBeenCalledTimes(2);
    source.reset();
    await expect(source.get(makeTray(), DEFAULT_SETTINGS)).resolves.toBeDefined();
    expect(f.build).toHaveBeenCalledTimes(3);
  });

  it("passes the abort signal on and never sends a build aborted while it waited", async () => {
    const f = fakeClient();
    const releases: (() => void)[] = [];
    f.build.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
        }),
    );
    const source = createMeshSource(() => Promise.resolve(f.client));
    const busy = Array.from({ length: MAX_IN_FLIGHT }, (_v, i) =>
      source.get(makeTray({ key: `busy${i}` }), DEFAULT_SETTINGS),
    );
    const controller = new AbortController();
    const waiting = source.get(makeTray({ key: "late" }), DEFAULT_SETTINGS, controller.signal);
    await vi.waitFor(() => expect(f.build).toHaveBeenCalledTimes(MAX_IN_FLIGHT));
    expect(f.build.mock.calls[0]?.[2]).toBeUndefined();
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    for (const release of releases) {
      release();
    }
    await Promise.all(busy);
    await vi.waitFor(() => expect(f.build).toHaveBeenCalledTimes(MAX_IN_FLIGHT));
    expect(f.build).toHaveBeenCalledTimes(MAX_IN_FLIGHT);
  });

  it("rejects a caller that aborts while sharing a build, without cancelling it for the others", async () => {
    const f = fakeClient();
    let release: () => void = () => undefined;
    f.build.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ mesh: cubeMesh(), volumeMm3: 1000 });
        }),
    );
    const source = createMeshSource(() => Promise.resolve(f.client));
    const first = source.get(makeTray(), DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(f.build).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const sharer = source.get(makeTray(), DEFAULT_SETTINGS, controller.signal);
    controller.abort();
    await expect(sharer).rejects.toMatchObject({ name: "AbortError" });
    release();
    await expect(first).resolves.toBeDefined();
    expect(f.build).toHaveBeenCalledTimes(1);
  });

  it("rejects at once for a signal that is already aborted, without sending the build", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    const controller = new AbortController();
    controller.abort();
    await expect(source.get(makeTray(), DEFAULT_SETTINGS, controller.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );
    // Give the abandoned build time to settle: it must not surface as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(f.build).not.toHaveBeenCalled();
  });

  it("forgets only the failed specs it is given, and keeps the cached meshes", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    const bad = makeTray({ key: "bad" });
    const good = makeTray({ key: "good" });
    await source.get(good, DEFAULT_SETTINGS);
    for (let i = 0; i < 2; i += 1) {
      f.build.mockRejectedValueOnce(new GeometryBuildError("Tray bad: no", "TraySpecError"));
      await expect(source.get(bad, DEFAULT_SETTINGS)).rejects.toThrow("no");
    }
    // Marked failed: rejects at once, without a build.
    await expect(source.get(bad, DEFAULT_SETTINGS)).rejects.toThrow("no");
    expect(f.build).toHaveBeenCalledTimes(3);
    source.forget([bad], DEFAULT_SETTINGS);
    await expect(source.get(bad, DEFAULT_SETTINGS)).resolves.toBeDefined();
    expect(f.build).toHaveBeenCalledTimes(4);
    // The mesh of another spec stayed cached.
    await source.get(good, DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(4);
  });

  it("starts the failure count over for a forgotten spec: it takes two failures to poison it again", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    const bad = makeTray({ key: "bad" });
    const fail = (): void => {
      f.build.mockRejectedValueOnce(new GeometryBuildError("Tray bad: no", "TraySpecError"));
    };
    for (let i = 0; i < 2; i += 1) {
      fail();
      await expect(source.get(bad, DEFAULT_SETTINGS)).rejects.toThrow("no");
    }
    source.forget([bad], DEFAULT_SETTINGS);
    // First failure after the retry: still allowed to build again.
    fail();
    await expect(source.get(bad, DEFAULT_SETTINGS)).rejects.toThrow("no");
    expect(f.build).toHaveBeenCalledTimes(3);
    fail();
    await expect(source.get(bad, DEFAULT_SETTINGS)).rejects.toThrow("no");
    expect(f.build).toHaveBeenCalledTimes(4);
    // The second failure poisons it: no build for the next get.
    await expect(source.get(bad, DEFAULT_SETTINGS)).rejects.toThrow("no");
    expect(f.build).toHaveBeenCalledTimes(4);
  });

  it("caps the cache, resets and disposes", async () => {
    const f = fakeClient();
    const source = createMeshSource(() => Promise.resolve(f.client));
    for (let i = 0; i <= MESH_CACHE_LIMIT; i += 1) {
      await source.get(makeTray({ key: `k${i}` }), DEFAULT_SETTINGS);
    }
    await source.get(makeTray({ key: "k0" }), DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(MESH_CACHE_LIMIT + 2);
    source.reset();
    await source.get(makeTray({ key: "k1" }), DEFAULT_SETTINGS);
    expect(f.build).toHaveBeenCalledTimes(MESH_CACHE_LIMIT + 3);
    source.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.dispose).toHaveBeenCalled();
  });
});
