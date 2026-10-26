// @vitest-environment node
// A pocket for a figure that lies on its side or flat (the Scythe airship, 33 × 101 × 41 mm): built
// from what sizing makes of it, it is a closed, printable tray with one long pocket, as deep as the
// figure is high lying down, cut through the front and back walls.
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { minOuter, realizeTray, size } from "../sizing";
import type { RealizeOptions } from "../sizing/types";
import { loadManifold } from "./load";
import { buildTray } from "./tray";
import { checkPrintability } from "./printability";
import { bounds, signedVolume, topology } from "./test-mesh";
import { GEO, traySpecFrom } from "./test-specs";
import { minis } from "../sizing/test-helpers";

let m: ManifoldToplevel;
beforeAll(async () => {
  m = await loadManifold();
});

const OPTS: RealizeOptions = { lipped: false, level: 0 };

describe("buildTray: a lying pocket", () => {
  it("builds the airship's flat pocket as one closed, printable tray", () => {
    const component = minis({
      figures: [{ name: "Airship", w: 33, d: 101, h: 41, count: 1 }],
    });
    const { requirements } = size([component], GEO);
    const variant = requirements[0]?.variants.find((v) => v.id.startsWith("flat|strip|"));
    expect(variant).toBeDefined();
    const part = variant?.parts[0];
    if (part === undefined) {
      throw new Error("no part");
    }
    const outer = minOuter(part, GEO, OPTS);
    const realized = realizeTray(part, outer, GEO, OPTS);
    const pocket = realized.compartments[0];
    expect(pocket?.kind).toBe("pocket");
    // lying flat: 41 wide, 101 long, 33 deep (each with 2 mm of room: a non-bulk figure's pocket gets the piece clearance plus 1)
    expect(pocket?.w).toBeCloseTo(43, 1);
    expect(pocket?.d).toBeCloseTo(103, 1);

    const spec = traySpecFrom(realized, outer, OPTS, GEO, part.trayKey);
    const { mesh, volumeMm3 } = buildTray(m, spec, GEO);
    expect(topology(mesh).closed).toBe(true);
    expect(signedVolume(mesh)).toBeCloseTo(volumeMm3, 0);
    const b = bounds(mesh);
    expect(b.max[0]).toBeCloseTo(spec.w, 3);
    expect(b.max[1]).toBeCloseTo(spec.d, 3);
    const report = checkPrintability(mesh);
    expect(report.problems).toEqual([]);
    expect(report.overhangTriangles).toBe(0);
  });
});
