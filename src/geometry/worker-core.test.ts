// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { createGeometryHandler } from "./worker-core";
import type { GeometryRequest, GeometryResponse } from "./types";
import { GEO, compartment, plainBox } from "./test-specs";

function cyclic(): object {
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  return loop;
}

function collect() {
  const sent: { message: GeometryResponse; transfer: Transferable[] }[] = [];
  const handle = createGeometryHandler(
    () => loadManifold(),
    (message, transfer) => sent.push({ message, transfer }),
  );
  return { sent, handle };
}

describe("geometry worker handler", () => {
  it("builds a tray and transfers its buffers", async () => {
    const { sent, handle } = collect();
    await handle({ type: "build", requestId: 7, spec: plainBox, settings: GEO });
    expect(sent).toHaveLength(1);
    const [first] = sent;
    expect(first?.message.type).toBe("built");
    if (first?.message.type !== "built") {
      return;
    }
    expect(first.message.requestId).toBe(7);
    expect(first.message.key).toBe(plainBox.key);
    expect(first.message.volumeMm3).toBeGreaterThan(0);
    expect(first.transfer).toEqual([
      first.message.mesh.positions.buffer,
      first.message.mesh.indices.buffer,
    ]);
    // Posting with the transfer list moves the buffers: they detach here and
    // arrive intact on the other side.
    const { positions, indices } = first.message.mesh;
    const copy = structuredClone(first.message, { transfer: first.transfer });
    expect(positions.byteLength).toBe(0);
    expect(indices.byteLength).toBe(0);
    expect(copy.type === "built" && copy.mesh.positions.length).toBeGreaterThan(0);
    expect(copy.type === "built" && copy.mesh.indices.length).toBeGreaterThan(0);
  });

  it("answers an invalid or newer-version spec with an error message", async () => {
    const { sent, handle } = collect();
    const newer = {
      ...plainBox,
      compartments: [
        { ...compartment({ x: 1.6, y: 1.6, w: 96.8, d: 56.8 }), features: [{ type: "magnet" }] },
      ],
    } as unknown as TraySpec;
    await handle({ type: "build", requestId: 1, spec: newer, settings: GEO });
    await handle({ type: "build", requestId: 2, spec: { ...plainBox, w: -1 }, settings: GEO });
    expect(sent.map((s) => s.message)).toEqual([
      expect.objectContaining({
        type: "error",
        requestId: 1,
        key: plainBox.key,
        message: expect.stringMatching(/magnet/),
        name: "UnsupportedFeatureError",
        feature: "magnet",
      }),
      expect.objectContaining({
        type: "error",
        requestId: 2,
        message: expect.stringMatching(/positive/),
        name: "TraySpecError",
      }),
    ]);
    const [, invalid] = sent;
    expect(invalid?.message).not.toHaveProperty("feature");
  });

  it("keeps the name of a runtime RangeError, which is not a spec failure", async () => {
    const sent: GeometryResponse[] = [];
    const handle = createGeometryHandler(
      () => Promise.reject(new RangeError("WebAssembly.Memory(): could not allocate memory")),
      (m) => sent.push(m),
    );
    await handle({ type: "build", requestId: 5, spec: plainBox, settings: GEO });
    expect(sent[0]).toMatchObject({ type: "error", requestId: 5, name: "RangeError" });
  });

  it.each([
    ["a number (a WASM exception pointer)", 12345, "WASM error 12345"],
    ["a string", "out of memory", "out of memory"],
    ["a plain object", { code: 7 }, '{"code":7}'],
    ["a cyclic object", cyclic(), "[object Object]"],
    ["undefined", undefined, "undefined"],
  ])("describes %s thrown by the kernel without an error name", async (_what, thrown, message) => {
    const sent: GeometryResponse[] = [];
    const handle = createGeometryHandler(
      () => Promise.reject(thrown),
      (m) => sent.push(m),
    );
    await handle({ type: "build", requestId: 3, spec: plainBox, settings: GEO });
    expect(sent).toEqual([{ type: "error", requestId: 3, key: plainBox.key, message }]);
  });

  it("answers a build cancelled before the module finished loading with an AbortError", async () => {
    const sent: GeometryResponse[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = createGeometryHandler(
      async () => {
        await gate;
        return loadManifold();
      },
      (message) => sent.push(message),
    );
    const first = handle({ type: "build", requestId: 1, spec: plainBox, settings: GEO });
    const second = handle({ type: "build", requestId: 2, spec: plainBox, settings: GEO });
    await handle({ type: "cancel", requestId: 1 });
    release();
    await Promise.all([first, second]);
    expect(sent.map((s) => [s.requestId, s.type])).toEqual([
      [1, "error"],
      [2, "built"],
    ]);
    expect(sent[0]).toEqual({
      type: "error",
      requestId: 1,
      key: plainBox.key,
      name: "AbortError",
      message: "cancelled",
    });
  });

  it("runs queued builds one at a time, in order, and honours a cancel for a queued one", async () => {
    const { sent, handle } = collect();
    const keys = ["a", "b", "c", "d", "e"];
    const done = keys.map((key, i) =>
      handle({ type: "build", requestId: i + 1, spec: { ...plainBox, key }, settings: GEO }),
    );
    // The cancel arrives while 3 is still queued behind 1 and 2.
    await handle({ type: "cancel", requestId: 3 });
    await Promise.all(done);
    expect(sent.map((s) => [s.message.requestId, s.message.type, s.message.key])).toEqual([
      [1, "built", "a"],
      [2, "built", "b"],
      [3, "error", "c"],
      [4, "built", "d"],
      [5, "built", "e"],
    ]);
    expect(sent[2]?.message).toMatchObject({ name: "AbortError" });
  });

  it("lets a cancel message through between two queued builds", async () => {
    const { sent, handle } = collect();
    const first = handle({ type: "build", requestId: 1, spec: plainBox, settings: GEO });
    const second = handle({ type: "build", requestId: 2, spec: plainBox, settings: GEO });
    // Sent only once build 1 has been answered, as the worker's event loop would.
    await first;
    await handle({ type: "cancel", requestId: 2 });
    await second;
    expect(sent.map((s) => [s.message.requestId, s.message.type])).toEqual([
      [1, "built"],
      [2, "error"],
    ]);
  });

  it("forgets cancels for finished and unknown builds, so ids can be reused", async () => {
    const { sent, handle } = collect();
    await handle({ type: "build", requestId: 1, spec: plainBox, settings: GEO });
    await handle({ type: "cancel", requestId: 1 });
    await handle({ type: "cancel", requestId: 99 });
    await handle({ type: "build", requestId: 1, spec: plainBox, settings: GEO });
    await handle({ type: "build", requestId: 99, spec: plainBox, settings: GEO });
    expect(sent.map((s) => [s.message.requestId, s.message.type])).toEqual([
      [1, "built"],
      [1, "built"],
      [99, "built"],
    ]);
  });

  it("retries the module load on the next build after a failed load", async () => {
    const sent: GeometryResponse[] = [];
    let attempts = 0;
    const handle = createGeometryHandler(
      () => {
        attempts += 1;
        return attempts === 1 ? Promise.reject(new Error("wasm fetch failed")) : loadManifold();
      },
      (message) => sent.push(message),
    );
    await handle({ type: "build", requestId: 1, spec: plainBox, settings: GEO });
    await handle({ type: "build", requestId: 2, spec: plainBox, settings: GEO });
    expect(sent.map((s) => [s.requestId, s.type])).toEqual([
      [1, "error"],
      [2, "built"],
    ]);
    expect(sent[0]).toMatchObject({ message: "wasm fetch failed", name: "Error" });
  });

  it("rejects when a response cannot be posted, so the worker can surface it", async () => {
    const handle = createGeometryHandler(
      () => loadManifold(),
      () => {
        throw new Error("port closed");
      },
    );
    await expect(
      handle({ type: "build", requestId: 1, spec: plainBox, settings: GEO }),
    ).rejects.toThrow("port closed");
  });

  it("rejects a malformed request instead of queueing it", async () => {
    const { sent, handle } = collect();
    const malformed = null as unknown as GeometryRequest;
    await expect(handle(malformed)).rejects.toThrow(TypeError);
    expect(sent).toEqual([]);
  });
});
