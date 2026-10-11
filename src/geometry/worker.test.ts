// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeometryResponse } from "./types";
import { GEO, plainBox } from "./test-specs";

// The WASM is loaded the Node way (no URL), as in the other kernel tests.
vi.mock("manifold-3d/manifold.wasm?url", () => ({ default: "manifold.wasm" }));
vi.mock("./load", async (importOriginal) => {
  const original = await importOriginal<typeof import("./load")>();
  return { loadManifold: () => original.loadManifold() };
});

type Listener = (event: { data: unknown }) => void;

const listeners: Listener[] = [];
const posted: { message: GeometryResponse; options: unknown }[] = [];

beforeEach(async () => {
  listeners.length = 0;
  posted.length = 0;
  vi.stubGlobal("self", {
    addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
    postMessage: (message: GeometryResponse, options: unknown) => posted.push({ message, options }),
  });
  vi.resetModules();
  await import("./worker");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geometry worker entry", () => {
  it("listens for messages and posts answers with their transfer list", async () => {
    expect(listeners).toHaveLength(1);
    listeners[0]?.({
      data: { type: "build", requestId: 4, spec: { ...plainBox, w: -1 }, settings: GEO },
    });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.message).toMatchObject({ type: "error", requestId: 4, name: "RangeError" });
    expect(posted[0]?.options).toEqual({ transfer: [] });
  });

  it("raises an uncaught error for a request it cannot answer", async () => {
    // The handler's rejection is rethrown from a timer, which the real worker
    // reports as an "error" event on the client's Worker object.
    const scheduled: (() => void)[] = [];
    vi.stubGlobal("setTimeout", (callback: () => void) => scheduled.push(callback));
    listeners[0]?.({ data: null });
    await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    expect(() => scheduled[0]?.()).toThrow(TypeError);
  });
});
