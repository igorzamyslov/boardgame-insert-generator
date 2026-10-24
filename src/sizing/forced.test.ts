import { describe, expect, it } from "vitest";
import { newComponent } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { CardsComponent, Component } from "../model/types";
import { size } from "./group";
import { minOuter, realizeTray } from "./realize";
import type { CompartmentReq, TrayPartReq } from "./types";

// Owner, 2026-10-23: the room a stack forces on a lower tray goes into its wells where a well can
// safely take it (bins, pockets, custom wells), never into solid wall; a deck keeps it as wall.

const settings = DEFAULT_SETTINGS;
const compOf = (c: Component): CompartmentReq | undefined =>
  size([c], settings).requirements[0]?.variants[0]?.parts[0]?.compartments[0];
const bin = (): CompartmentReq | undefined => compOf(newComponent("bulk"));
const deck = (): CompartmentReq | undefined =>
  compOf({ ...(newComponent("cards") as CardsComponent), storage: "upright-long" });
const part = (c: CompartmentReq): TrayPartReq => ({
  trayKey: "t:p0:0",
  arrangement: "strip",
  compartments: [c],
  rotatable: true,
});

/** The well's size in a tray `extra` mm bigger on both axes than its minimum, the stack asking for all of it. */
function wellIn(p: TrayPartReq, extra: number): { min: [number, number]; got: [number, number] } {
  const opts = { lipped: false, level: 0 };
  const o = minOuter(p, settings, opts);
  const at = { w: o.w + extra, d: o.d + extra, h: o.h };
  const base = realizeTray(p, o, settings, opts).compartments[0];
  const forced = realizeTray(p, at, settings, { ...opts, stackMin: { w: at.w, d: at.d } })
    .compartments[0];
  return { min: [base?.w ?? 0, base?.d ?? 0], got: [forced?.w ?? 0, forced?.d ?? 0] };
}

describe("room a stack forces on a tray", () => {
  it("is marked for the wells that can take it, never for a deck's", () => {
    expect(bin()?.forcedOk).toBe(true);
    expect(deck()?.forcedOk).toBeUndefined();
    const { requirements } = size([newComponent("custom")], settings);
    expect(requirements[0]?.variants[0]?.parts[0]?.compartments[0]?.forcedOk).toBe(true);
  });

  it("goes into a bin's well, which gets bigger by it, not into the walls", () => {
    const { min, got } = wellIn(part(bin() as CompartmentReq), 10);
    expect(got[0]).toBeCloseTo(min[0] + 10, 1);
    expect(got[1]).toBeCloseTo(min[1] + 10, 1);
  });

  it("stays wall for a deck", () => {
    const { min, got } = wellIn(part(deck() as CompartmentReq), 10);
    expect(got[0]).toBeCloseTo(min[0], 1);
  });
});
