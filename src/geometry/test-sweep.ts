// Test helper: the mesh sweep of real sizing output (tray.sizing*.test.ts split the fixtures
// between them so they run in parallel).
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { SPEC_TOLERANCE, applyFingerRoom } from "../model/settings";
import type { Settings, TraySpec } from "../model/types";
import { splitDividers } from "../layout/dividers";
import { openSpacers } from "../layout/spacers";
import { settingsValid } from "../model/validate";
import { minOuter, realizeTray, rotateRealized, size } from "../sizing";
import { carriesName } from "../model/part-name";
import { hasEngraving, planEngravings } from "./engrave";
import { loadManifold } from "./load";
import { planTray } from "./plan";
import { problemsOf } from "./test-build";
import {
  CHAMFER_1,
  FIXTURE_SETTINGS,
  SWEEP_FIXTURES,
  STEPPED,
  SWEEP_OPTIONS,
  THINNEST,
  THIN_WALLS,
  floorHoles,
  loadFixture,
  traySpecFrom,
} from "./test-specs";
import type { Profile } from "./test-specs";
import type { RealizeOptions } from "../sizing/types";

// Real sizing output built into meshes: every part of every variant of every
// fixture, under the fixture settings and under the thinnest walls with the
// largest chamfer, must come out as a closed, printable solid whose bounding
// box is the spec size, and so must its spacers. Each part is built at every
// lip and level option; the slack over minOuter and the rotation rotate with
// the part's index, so every combination is reached while the run stays well
// under 15 s.

// A settings profile, and the lip and level options each part is built at (all by default).
type MeshProfile = [string, Profile, (readonly RealizeOptions[])?];

/** Names of every shape the app gives a part: one word, several, a counter, ten characters. */
const SWEEP_NAMES = [
  "Cards",
  "Spac Dice",
  "Market 12",
  "Wooden Meeples",
  "A",
  "Spare Hex 2",
  "ABCDEFGHIJ",
  "KLMNOPQRST",
  "UVWXYZ 0123",
  "456789-RSW",
].map((n) => n.slice(0, 10).trim());

const MESH_PROFILES: MeshProfile[] = [
  ["fixture settings", FIXTURE_SETTINGS],
  ["thinnest wall, floor, lip and the largest chamfer", THINNEST],
  ["thinnest wall, floor and divider", THIN_WALLS, [{ lipped: false, level: 0 }]],
  ["a 1 mm chamfer", CHAMFER_1, [{ lipped: false, level: 1 }]],
  // the slab under an upper tray, and the socket in one with another on it
  [
    "the stepped base",
    STEPPED,
    [
      { lipped: true, level: 0 },
      { lipped: true, level: 1 },
    ],
  ],
];

// Thicker outer walls where wall cutouts leave the tray, on a lipped and an upper tray (the other
// profiles cover the plain ones): built for the fixtures that have cutouts (bits-heavy has none).
const FINGER_ROOM: MeshProfile = [
  "finger room in the cut walls and dividers",
  (s) => applyFingerRoom(s, true),
  [
    { lipped: true, level: 0 },
    { lipped: false, level: 1 },
  ],
];

function meshProfiles(fixture: string): MeshProfile[] {
  return fixture === "bits-heavy" ? MESH_PROFILES : [...MESH_PROFILES, FINGER_ROOM];
}

// Extra mm over minOuter on every axis (meshes are costly, so one axis value per build).
const SLACKS = [0, 10, 30];

interface Selected {
  spec: TraySpec;
  where: string;
}

interface Selection {
  settings: Settings;
  specs: Selected[];
}

const selections = new Map<string, Selection>();

// The specs one fixture and profile builds: each part at every lip and level option, with the
// slack and the rotation picked by the part's and the option's index, then that tray's spacers.
// Sized once per fixture and profile, then shared by the build and the coverage tests.
function selection(
  fixture: string,
  raw: unknown,
  [label, profile, options = SWEEP_OPTIONS]: MeshProfile,
): Selection {
  const key = `${fixture}|${label}`;
  const cached = selections.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const { components, groups, settings: base } = loadFixture(raw);
  const settings = profile(base);
  const specs: Selected[] = [];
  let index = 0;
  for (const req of size(components, settings, groups).requirements) {
    for (const variant of req.variants) {
      for (const part of variant.parts) {
        options.forEach((opts, k) => {
          const slack = SLACKS[(index + k) % SLACKS.length] ?? 0;
          const rotated = (index + k) % 2 === 1;
          const min = minOuter(part, settings, opts);
          const outer = { w: min.w + slack, d: min.d + slack, h: min.h + slack };
          const where = `${variant.id} ${part.trayKey} ${JSON.stringify(opts)} +${slack}${rotated ? " rotated" : ""}`;
          const plain = realizeTray(part, outer, settings, opts);
          const realized = rotated ? rotateRealized(plain, outer) : plain;
          const placed = rotated ? { w: outer.d, d: outer.w, h: outer.h } : outer;
          const tray = traySpecFrom(realized, placed, opts, settings, part.trayKey);
          specs.push({ spec: { ...tray, rotated }, where });
          // the dividers that stand in the tray's slots, as printed
          for (const plate of splitDividers([{ ...tray, rotated }]).slice(1)) {
            specs.push({ spec: plate, where: `${where} divider` });
          }
          realized.spacers.forEach((sp) => {
            specs.push({ spec: sp, where: `${where} spacer` });
            // the same spacer as printed: an open box wherever the leftover style and size allow
            for (const open of openSpacers([sp], { settings })) {
              if (!open.solid) {
                specs.push({ spec: open, where: `${where} open spacer` });
              }
            }
          });
        });
        index += 1;
      }
    }
  }
  const result = { settings, specs };
  selections.set(key, result);
  return result;
}

/** The mesh sweep of `fixtures` (a test file's share of SWEEP_FIXTURES). */
export function sweepMeshes(fixtures: readonly [string, unknown][]): void {
  let m: ManifoldToplevel;
  beforeAll(async () => {
    m = await loadManifold();
  });

  describe.each(fixtures)("buildTray builds the sizing output of %s", (name, raw) => {
    it.each(meshProfiles(name))("with %s", { timeout: 240_000 }, (...profile) => {
      const { settings, specs } = selection(name, raw, profile);
      expect(settingsValid(settings), "profile settings are valid").toBe(true);
      let built = 0;
      let rotated = 0;
      let engraved = 0;
      const failures: string[] = [];
      for (const [i, { spec: plain, where }] of specs.entries()) {
        // Every part carries a name (a few short words), as the app asks for them: the
        // engraving must leave a closed, printable solid of the spec's size wherever it lands.
        const spec = { ...plain, partName: SWEEP_NAMES[i % SWEEP_NAMES.length] };
        try {
          if (
            carriesName(spec.part) &&
            hasEngraving(planEngravings(planTray(spec, settings), spec.partName ?? ""))
          ) {
            engraved += 1;
          }
          const problems = problemsOf(m, spec, settings);
          if (problems.length > 0) {
            failures.push(`${where}: ${problems.join("; ")}`);
            continue;
          }
          built += 1;
          rotated += spec.rotated && spec.part === "tray" ? 1 : 0;
        } catch (error) {
          failures.push(`${where}: ${String(error)}`);
        }
      }
      expect(failures.slice(0, 3), `${failures.length} of ${specs.length} specs failed`).toEqual(
        [],
      );
      expect(built).toBe(specs.length);
      expect(rotated).toBeGreaterThan(0);
      // plates (spacers, dividers) carry none, and a tray with no room is left plain
      expect(engraved).toBeGreaterThan(0);
    });
  });
}

/** What the mesh sweep of every SWEEP_FIXTURES fixture builds, taken together. */
export function sweepCoverage(): void {
  describe("the built sizing output covers", () => {
    let specs: TraySpec[] = [];
    let trays: TraySpec[] = [];
    let compartments: { tray: TraySpec; c: TraySpec["compartments"][number] }[] = [];
    let holes = 0;
    beforeAll(() => {
      const selections = SWEEP_FIXTURES.flatMap(([name, raw]) =>
        meshProfiles(name).map((profile) => selection(name, raw, profile)),
      );
      specs = selections.flatMap((sel) => sel.specs.map((s) => s.spec));
      holes = selections.reduce(
        (sum, sel) => sum + sel.specs.reduce((n, s) => n + floorHoles(s.spec, sel.settings), 0),
        0,
      );
      trays = specs.filter((s) => s.part === "tray");
      compartments = trays.flatMap((s) => s.compartments.map((c) => ({ tray: s, c })));
    });

    // "spare" is not here: sizing no longer makes a spare compartment (geometry 0.5.1). The kind is
    // still built, as an open leftover, by `spareLeftover` in test-specs (tray.test.ts).
    it.each(["well", "pocket", "scoop"])("compartment kind %s", (kind) => {
      expect(compartments.some(({ c }) => c.kind === kind)).toBe(true);
    });

    it.each(["wallCutout", "scoop", "cornerRelief", "dividerSlot"])("feature %s", (type) => {
      expect(compartments.some(({ c }) => c.features.some((f) => f.type === type))).toBe(true);
    });

    it("wall cutouts with a floor notch, through outer walls and dividers", () => {
      const cuts = compartments.flatMap(({ tray, c }) =>
        c.features.flatMap((f) => (f.type === "wallCutout" ? [{ tray, f }] : [])),
      );
      expect(cuts.some(({ f }) => f.floorNotch > 0)).toBe(true);
      expect(cuts.some(({ f }) => f.floorNotch === 0)).toBe(true);
      expect(holes).toBeGreaterThan(0);
    });

    it("divider slots, along y and (in a turned tray) along x, and the dividers that stand in them", () => {
      const slots = compartments.flatMap(({ c }) =>
        c.features.flatMap((f) => (f.type === "dividerSlot" ? [f] : [])),
      );
      expect(slots.some((f) => f.axis === "y")).toBe(true);
      expect(slots.some((f) => f.axis === "x")).toBe(true);
      expect(specs.some((s) => s.part === "divider")).toBe(true);
    });

    it("raised floors, lipped, unlipped, upper and rotated trays, and spacers", () => {
      expect(
        compartments.some(({ tray, c }) => c.floorZ > tray.floor + SPEC_TOLERANCE),
        "raised floor",
      ).toBe(true);
      expect(trays.some((s) => s.lip)).toBe(true);
      expect(trays.some((s) => !s.lip)).toBe(true);
      expect(trays.some((s) => s.level > 0)).toBe(true);
      expect(trays.some((s) => s.rotated)).toBe(true);
      expect(specs.some((s) => s.part === "spacer")).toBe(true);
      expect(
        specs.some((s) => s.part === "spacer" && !s.solid),
        "an open spacer",
      ).toBe(true);
      const notched = specs.filter((s) => s.features?.some((f) => f.type === "spacerNotch"));
      expect(notched.length, "spacers notched for a finger channel").toBeGreaterThan(0);
      expect(
        notched.some((s) => s.rotated),
        "a turned notched spacer",
      ).toBe(true);
    });
  });
}
