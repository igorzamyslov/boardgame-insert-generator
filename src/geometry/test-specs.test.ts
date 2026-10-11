import { describe, expect, it } from "vitest";
import { GEO, traySpecFrom } from "./test-specs";

describe("traySpecFrom", () => {
  const realized = { wall: 1.6, compartments: [], spacers: [] };
  const outer = { w: 50, d: 40, h: 20 };
  const lipped = { lipped: true, level: 0 };

  it("puts a lip on a lipped tray only when the settings enable lips, like the layout", () => {
    expect(traySpecFrom(realized, outer, lipped, GEO, "t").lip).toBe(true);
    const off = { ...GEO, lip: { ...GEO.lip, enabled: false } };
    expect(traySpecFrom(realized, outer, lipped, off, "t").lip).toBe(false);
    expect(traySpecFrom(realized, outer, { lipped: false, level: 0 }, GEO, "t").lip).toBe(false);
  });
});
