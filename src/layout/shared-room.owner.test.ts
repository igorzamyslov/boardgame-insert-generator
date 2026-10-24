// src/layout/shared-room.owner.test.ts
// The owner's Star Realms file (test/fixtures/star-realms-owner-6.json): the Starter deck, three decks
// in three stacked trays, set to "As much as fits". In the plan stored by 0.20.0 Deck 1's tray took
// all the spare height (15.4 mm) and Deck 2 and Deck 3 got none (5.6 and 4 mm); the owner expected
// every tray to get some (2026-10-24: "if components (even different ones) are stacked, and they have
// the option enabled, they should split the available space between them"), and the top tray had no
// rim, so the three only stacked in one order.
import { describe, expect, it } from "vitest";
import starRealmsOwner6 from "../../test/fixtures/star-realms-owner-6.json";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { Project, TraySpec } from "../model/types";
import { size } from "../sizing";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import { checkHardRules } from "./test-hard-rules";

function owner(): Project {
  const parsed = parseProject(starRealmsOwner6);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

function plan(p: Project) {
  const input = {
    requirements: size(p.components, p.settings).requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: "0.0.0-test",
  };
  const result = optimize(input, 1, DEFAULT_ITERATIONS);
  if (!result.layout) {
    throw new Error("the owner's file no longer fits");
  }
  return { input, layout: result.layout, notices: result.notices };
}

describe("the owner's Starter deck: three stacked trays set to As much as fits", () => {
  const p = owner();
  const { input, layout, notices } = plan(p);
  const starter = layout.trays
    .filter((t: TraySpec) => t.part === "tray" && /Deck \d/.test(JSON.stringify(t.compartments)))
    .sort((a, b) => a.level - b.level);

  it("is three trays in one stack", () => {
    expect(starter).toHaveLength(3);
    expect(new Set(starter.map((t) => t.path)).size).toBe(1);
  });

  it("gives every tray some of the spare height, not the first one all of it", () => {
    const [d1, d2, d3] = starter;
    // 0.20.0: 15.4, 5.6 and 4 mm
    expect(d1?.h).toBeLessThan(15.4);
    expect(d2?.h).toBeGreaterThan(5.6);
    expect(d3?.h).toBeGreaterThan(4);
  });

  it("gives the two trays of 5 cards the same room, to within a layer and the top tray's remainder", () => {
    const [, d2, d3] = starter;
    expect(Math.abs((d2?.h ?? 0) - (d3?.h ?? 0))).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it("carries the joint on all three: the rim on top of each, so any can go on top", () => {
    expect(starter.map((t) => t.lip)).toEqual([true, true, true]);
    expect(notices.filter((n) => n.code === "layout.copiesJoint")).toEqual([]);
  });

  it("keeps the hard rules", () => {
    expect(checkHardRules(input, layout, notices)).toEqual([]);
  });
});
