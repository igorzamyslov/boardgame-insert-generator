// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TraySpec } from "../model/types";
import { loadManifold } from "./load";
import { createGeometryHandler } from "./worker-core";
import type { GeometryResponse } from "./types";
import { GEO, compartment, plainBox } from "./test-specs";

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
      }),
      expect.objectContaining({
        type: "error",
        requestId: 2,
        message: expect.stringMatching(/positive/),
      }),
    ]);
  });

  it("skips a build cancelled before the module finished loading", async () => {
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
    expect(sent.map((s) => s.requestId)).toEqual([2]);
  });
});
