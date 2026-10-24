// src/instructions/reserved.test.ts
import { describe, expect, it } from "vitest";
import { fixtureProject } from "../app/test-helpers";
import { planFrame } from "../plan/layers";
import type { ReservedSpec } from "../model/types";
import { closingSteps, whereItLies } from "./reserved";

const project = fixtureProject();
const box = { ...project.box, headroom: 12 };
const frame = planFrame(box, project.settings);

const area = (over: Partial<ReservedSpec> = {}): ReservedSpec => ({
  area: 0,
  name: "Rulebook",
  x: 0,
  y: 0,
  w: 200,
  d: 120,
  z: 40,
  ...over,
});

const right = (w: number) => frame.usableW - w;
const back = (d: number) => frame.usableD - d;

describe("whereItLies", () => {
  it("names each of the four corners", () => {
    expect(whereItLies(area(), box, project.settings)).toBe("front left");
    expect(whereItLies(area({ x: right(200) }), box, project.settings)).toBe("front right");
    expect(whereItLies(area({ y: back(120) }), box, project.settings)).toBe("back left");
    expect(whereItLies(area({ x: right(200), y: back(120) }), box, project.settings)).toBe(
      "back right",
    );
  });

  it("reads a turned area (width and length swapped) the same way", () => {
    const turned = { w: 120, d: 200 };
    expect(
      whereItLies(area({ ...turned, x: right(120), y: back(200) }), box, project.settings),
    ).toBe("back right");
    expect(whereItLies(area({ ...turned, y: back(200) }), box, project.settings)).toBe("back left");
  });

  it("names the nearer walls when the area touches no corner", () => {
    expect(whereItLies(area({ x: 10, y: back(120) - 8 }), box, project.settings)).toBe("back left");
  });
});

describe("closingSteps", () => {
  it("is one sentence per area: name, size, thickness and corner", () => {
    const steps = closingSteps([area({ x: right(200), y: back(120) })], box, project.settings);
    expect(steps).toEqual([
      {
        name: "Rulebook",
        text: "Lay the Rulebook (200 × 120 mm, 12 mm thick) flat on the trays in the back right corner.",
      },
    ]);
  });

  it("is empty with no areas", () => {
    expect(closingSteps(undefined, box, project.settings)).toEqual([]);
    expect(closingSteps([], box, project.settings)).toEqual([]);
  });
});
