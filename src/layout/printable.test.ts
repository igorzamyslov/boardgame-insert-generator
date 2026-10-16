import { describe, expect, it } from "vitest";
import { inputsHash } from "../model/hash";
import { noForeign, parseProject, serializeProject } from "../model/schema";
import type { Project, Settings } from "../model/types";
import { encodeHash } from "../test-support/link";
import { optimize } from "./optimize";
import { printableParts } from "./printable";
import { FIXTURES, fixtureInput, type FixtureName } from "./test-fixtures";

// The merge switches are print-time decompositions (spec minimal-trays §6, lever 1): the stored
// layout, its hash and the share link are what they were, whichever way they are set.
const SWITCHES: Partial<Settings>[] = [
  { mergeFillers: true, mergeRisers: false },
  { mergeFillers: false, mergeRisers: false },
  { mergeFillers: true, mergeRisers: true },
  { mergeFillers: false, mergeRisers: true },
];

function project(name: FixtureName): Project {
  const parsed = parseProject(FIXTURES[name]);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

describe("merging is a print-time decomposition", () => {
  it.each(["cards-heavy", "small-tiles"] as const)(
    "%s: neither switch changes the hash, the stored layout or the share link",
    (name) => {
      const p = project(name);
      const runs = SWITCHES.map((s) => {
        const input = fixtureInput(name);
        const settings = { ...input.settings, ...s };
        const q: Project = { ...p, settings: { ...p.settings, ...s } };
        const hash = inputsHash(q);
        const { layout } = optimize({ ...input, settings, inputsHash: hash }, 1, 4000);
        expect(layout).not.toBeNull();
        const link = encodeHash({ ...q, layout: layout ?? undefined }, { components: [] });
        return { hash, layout, link };
      });
      const [first, ...rest] = runs;
      for (const r of rest) {
        expect(r.hash).toBe(first?.hash);
        expect(r.layout).toEqual(first?.layout);
      }
      // At the defaults a link does not mention either switch, so it is as long as before. A
      // switch set otherwise is a setting like any other and adds just that to the link: the
      // stored layout in it is the same.
      expect(
        serializeProject({ ...p, layout: first?.layout ?? undefined }, noForeign()),
      ).not.toContain("merge");
      const defaultLength = first?.link.length ?? 0;
      for (const r of rest) {
        expect(r.link.length - defaultLength).toBeLessThan(40);
      }
    },
  );

  it("groups the same stored trays into fewer printed parts, and only the fillers and risers", () => {
    const p = project("small-tiles");
    const { layout } = optimize(fixtureInput("small-tiles"), 1, 20_000);
    const trays = layout?.trays ?? [];
    const printed = (s: Partial<Settings>) =>
      printableParts(trays, {
        components: p.components,
        settings: { ...p.settings, ...s },
        printer: p.printer,
        locks: p.locks,
      }).trays;
    const off = printed({ mergeFillers: false });
    const on = printed({ mergeFillers: true });
    const all = printed({ mergeFillers: true, mergeRisers: true });
    const loose = (parts: typeof off) =>
      parts.filter((t) => t.part === "leftover" || t.part === "riser").length;
    expect(loose(on)).toBeLessThan(loose(off));
    expect(loose(all)).toBeLessThanOrEqual(loose(on));
    // trays and spacers are the same parts either way
    const kept = (parts: typeof off) =>
      parts.filter((t) => t.part === "tray" || t.part === "spacer");
    expect(kept(on)).toEqual(kept(off));
    expect(kept(all)).toEqual(kept(off));
    // and merging only joins: the plastic outside the bridges is the same
    const volume = (parts: typeof off) =>
      parts.reduce((sum, t) => sum + (t.merged ? 0 : t.w * t.d * t.h), 0);
    expect(volume(on)).toBeLessThan(volume(off));
    expect(trays.filter((t) => t.merged !== undefined)).toEqual([]);
  });

  it("changes nothing without fillers to merge", () => {
    const p = project("bits-heavy");
    const { layout } = optimize(fixtureInput("bits-heavy"), 1, 3000);
    // bits-heavy has fillers beside its bins (growth is bounded): leave them out, so none merge
    const trays = (layout?.trays ?? []).filter((t) => t.part !== "leftover");
    const inputs = (s: Partial<Settings>) => ({
      components: p.components,
      settings: { ...p.settings, ...s },
      printer: p.printer,
      locks: p.locks,
    });
    expect(printableParts(trays, inputs({ mergeFillers: true })).trays).toEqual(
      printableParts(trays, inputs({ mergeFillers: false })).trays,
    );
  });
});
