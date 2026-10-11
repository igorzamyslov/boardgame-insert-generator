import { describe, expect, it } from "vitest";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import { parseProject } from "../model/schema";
import type { TraySpec } from "../model/types";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import type { OuterSize, RealizedTray, RealizeOptions } from "../sizing/types";
import { ceilU, fromU } from "../sizing/units";
import { planTray } from "./plan";

// Real sizing output must always be buildable: planTray's limits (with their
// tolerance) have to accept every spec sitting exactly on a sizing minimum.

const FIXTURES: Record<string, unknown> = {
  "cards-heavy": cardsHeavy,
  "bits-heavy": bitsHeavy,
  "tiles-minis": tilesMinis,
  "tiny-box": tinyBox,
};

const OPTIONS: RealizeOptions[] = [
  { lipped: false, level: 0 },
  { lipped: true, level: 0 },
  { lipped: false, level: 1 },
  { lipped: true, level: 1 },
];

const SLACKS = [0, 10];

// A tray as the layout builds it from a realized tray placed at `outer`.
function traySpecFrom(
  realized: RealizedTray,
  outer: OuterSize,
  opts: RealizeOptions,
  floor: number,
  key: string,
): TraySpec {
  return {
    key,
    part: "tray",
    path: "0",
    stack: 0,
    level: opts.level,
    x: 0,
    y: 0,
    z: 0,
    w: outer.w,
    d: outer.d,
    h: outer.h,
    rotated: false,
    wall: realized.wall,
    floor: fromU(ceilU(floor)),
    lip: opts.lipped,
    solid: false,
    compartments: realized.compartments,
  };
}

describe.each(Object.entries(FIXTURES))("planTray accepts sizing output of %s", (name, raw) => {
  const parsed = parseProject(raw);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const { components, settings } = parsed.project;
  const { requirements } = size(components, settings);

  it("has parts to check", () => {
    expect(requirements.length).toBeGreaterThan(0);
  });

  it("never throws, plain and rotated, lipped or not, at levels 0 and 1, with and without slack", () => {
    let planned = 0;
    for (const req of requirements) {
      for (const variant of req.variants) {
        for (const part of variant.parts) {
          for (const opts of OPTIONS) {
            const min = minOuter(part, settings, opts);
            for (const slack of SLACKS) {
              const outer = { w: min.w + slack, d: min.d + slack, h: min.h + slack };
              const realized = realizeTray(part, outer, settings, opts);
              const turned = { w: outer.d, d: outer.w, h: outer.h };
              const cases: [string, TraySpec[]][] = [
                [
                  "plain",
                  [
                    traySpecFrom(realized, outer, opts, settings.floor, part.trayKey),
                    ...realized.spacers,
                  ],
                ],
                [
                  "rotated",
                  (() => {
                    const r = rotateRealized(realized, outer);
                    return [
                      traySpecFrom(r, turned, opts, settings.floor, part.trayKey),
                      ...r.spacers,
                    ];
                  })(),
                ],
              ];
              for (const [label, specs] of cases) {
                for (const spec of specs) {
                  const where = `${name} ${variant.id} ${spec.key} ${label} ${JSON.stringify(opts)} +${slack}`;
                  expect(() => planTray(spec, settings), where).not.toThrow();
                  planned++;
                }
              }
            }
          }
        }
      }
    }
    expect(planned).toBeGreaterThan(0);
  });
});
