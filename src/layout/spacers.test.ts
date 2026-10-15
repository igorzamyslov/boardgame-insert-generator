import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { MIN_SPACER, MIN_SPARE, SPACER_MIN_WALL } from "../sizing/constants";
import { openSpacers, spacerWall } from "./spacers";
import { traySpec } from "./test-utils";

const spacer = (o: Partial<TraySpec> = {}): TraySpec =>
  traySpec({
    key: "a:p0:0:spacer",
    part: "spacer",
    path: "",
    w: 40,
    d: 60,
    h: 30,
    wall: 0,
    floor: 0,
    solid: true,
    ...o,
  });
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...o });
const open = (t: TraySpec, s: Settings = settings()): TraySpec =>
  openSpacers([t], { settings: s })[0] as TraySpec;

describe("openSpacers", () => {
  it("opens a spacer into a walled box with a floor, the footprint and height unchanged", () => {
    const t = spacer({ x: 5, y: 6, z: 1.2 });
    const o = open(t);
    expect(o.solid).toBe(false);
    expect([o.x, o.y, o.z, o.w, o.d, o.h]).toEqual([5, 6, 1.2, 40, 60, 30]);
    expect([o.wall, o.floor]).toEqual([SPACER_MIN_WALL, DEFAULT_SETTINGS.floor]);
    expect(o.compartments).toEqual([
      { x: 2, y: 2, w: 36, d: 56, floorZ: 1.2, kind: "spare", contents: "", features: [] },
    ]);
  });

  it("gives the wall the tray's, and never under SPACER_MIN_WALL", () => {
    expect(spacerWall(settings({ wall: 1.6 }))).toBe(SPACER_MIN_WALL);
    expect(spacerWall(settings({ wall: 3 }))).toBe(3);
    expect(open(spacer(), settings({ wall: 3 })).compartments[0]).toMatchObject({ x: 3, w: 34 });
  });

  it("keeps a solid spacer with leftover: solid", () => {
    const t = spacer();
    expect(open(t, settings({ leftover: "solid" }))).toBe(t);
  });

  it("keeps a spacer solid when its inside would be under MIN_SPARE in either direction", () => {
    const edge = MIN_SPARE + 2 * SPACER_MIN_WALL;
    expect(open(spacer({ w: edge })).solid).toBe(false);
    expect(open(spacer({ w: edge - 0.01 })).solid).toBe(true);
    expect(open(spacer({ d: edge })).solid).toBe(false);
    expect(open(spacer({ d: edge - 0.01 })).solid).toBe(true);
  });

  it("keeps a spacer solid when its pocket would be under MIN_SPACER deep", () => {
    const floor = DEFAULT_SETTINGS.floor;
    expect(open(spacer({ h: floor + MIN_SPACER })).solid).toBe(false);
    expect(open(spacer({ h: floor + MIN_SPACER - 0.01 })).solid).toBe(true);
  });

  it("keeps a spacer solid when its finger notch would cut into the floor", () => {
    const notch = (depth: number): TraySpec["features"] => [
      { type: "spacerNotch", axis: "x", at: 30, width: 20, depth },
    ];
    expect(open(spacer({ features: notch(20) })).solid).toBe(false);
    expect(open(spacer({ features: notch(29) })).solid).toBe(true);
    // a notch that leaves the notch where it was
    expect(open(spacer({ features: notch(20) })).features).toEqual(notch(20));
  });

  it("judges each plate on its own size: a thin plate stays solid, a thick one opens", () => {
    const [thin, thick] = openSpacers(
      [spacer({ key: "a:p0:0:spacer:1", w: 6 }), spacer({ key: "a:p0:0:spacer:2", w: 24 })],
      { settings: settings() },
    ) as [TraySpec, TraySpec];
    expect([thin.solid, thick.solid]).toEqual([true, false]);
  });

  it("leaves everything that is not a stored solid spacer as it is", () => {
    const tray = traySpec({ w: 100, d: 60, h: 40 });
    const riser = traySpec({ part: "riser", solid: true });
    const filler = traySpec({ part: "leftover", solid: true });
    const opened = open(spacer());
    expect(openSpacers([tray, riser, filler, opened], { settings: settings() })).toEqual([
      tray,
      riser,
      filler,
      opened,
    ]);
  });
});
