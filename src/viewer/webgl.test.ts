// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function stubContext(gl: unknown) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => gl as RenderingContext | null);
}

describe("hasWebGL", () => {
  it("releases the probe context and remembers a positive answer", async () => {
    const loseContext = vi.fn();
    const getContext = stubContext({ getExtension: () => ({ loseContext }) });
    const { hasWebGL } = await import("./webgl");
    expect(hasWebGL()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(hasWebGL()).toBe(true);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("answers false, without remembering it, when there is no context", async () => {
    const getContext = stubContext(null);
    const { hasWebGL } = await import("./webgl");
    expect(hasWebGL()).toBe(false);
    getContext.mockImplementation(() => ({ getExtension: () => null }) as never);
    expect(hasWebGL()).toBe(true);
  });

  it("answers false when probing throws", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { hasWebGL } = await import("./webgl");
    expect(hasWebGL()).toBe(false);
  });
});
