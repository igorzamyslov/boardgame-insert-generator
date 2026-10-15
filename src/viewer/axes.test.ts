import { describe, expect, it } from "vitest";
import { projectAxes } from "./axes";

describe("projectAxes", () => {
  it("shows the axes of a camera in front of the box: X right, Z up, Y into the screen", () => {
    const axes = projectAxes({ right: [1, 0, 0], up: [0, 0, 1], back: [0, -1, 0] });
    const by = Object.fromEntries(axes.map((a) => [a.axis, a]));
    expect(by.x).toMatchObject({ dx: 1, dy: 0, depth: 0 });
    expect(by.z).toMatchObject({ dx: 0, dy: 1, depth: 0 });
    expect(by.y).toMatchObject({ dx: 0, dy: 0, depth: -1 });
  });

  it("orders the axes farthest first, so the nearest is painted last", () => {
    // Looking from above and in front: Z points at the viewer, Y away.
    const axes = projectAxes({ right: [1, 0, 0], up: [0, 0.6, 0.8], back: [0, -0.8, 0.6] });
    expect(axes.map((a) => a.axis)).toEqual(["y", "x", "z"]);
  });
});
