// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PNG_HEIGHT_PX, pngSize, svgToPng, withPixelSize } from "./png";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("withPixelSize", () => {
  it("replaces the size of the root element only", () => {
    expect(
      withPixelSize(
        '<svg viewBox="0 0 10 5" width="30" height="15"><rect width="3" height="2"/></svg>',
        1000,
        500,
      ),
    ).toBe('<svg width="1000" height="500" viewBox="0 0 10 5"><rect width="3" height="2"/></svg>');
  });

  it("adds a size to a root element that has none", () => {
    expect(withPixelSize('<svg viewBox="0 0 1 1"/>', 10, 10)).toBe(
      '<svg width="10" height="10" viewBox="0 0 1 1"/>',
    );
  });
});

describe("pngSize", () => {
  it("keeps the aspect ratio of a tall drawing within the height limit", () => {
    expect(pngSize('<svg viewBox="0 0 10 100">', 1600)).toEqual({
      width: Math.round((1600 * MAX_PNG_HEIGHT_PX) / 16000),
      height: MAX_PNG_HEIGHT_PX,
    });
  });
});

describe("svgToPng", () => {
  it("draws the SVG at the target size so the browser doesn't scale a bitmap", async () => {
    let loaded = "";
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        set src(v: string) {
          loaded = decodeURIComponent(v.slice(v.indexOf(",") + 1));
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => {
      cb(new Blob(["png"], { type: "image/png" }));
    });
    const blob = await svgToPng(
      '<svg viewBox="-4.5 -4.5 209 125" width="627" height="375"/>',
      1000,
    );
    expect(blob.type).toBe("image/png");
    expect(loaded).toContain('width="1000" height="598"');
    expect(loaded).not.toContain('width="627"');
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1000, 598);
  });
});
