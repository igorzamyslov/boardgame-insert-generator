// src/ui/components/GrowthOptions.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withGrowth } from "../../model/defaults";
import type { Component, GrowthAxis } from "../../model/types";
import { GrowthOptions, growthMaxLine } from "./GrowthOptions";
import { of } from "./test-editors";

afterEach(cleanup);

/** What a "Max" on the footprint says, which `fill.ts` does: the room beside the others, up to the bed. */
const FOOTPRINT = "As much as fits beside the other trays and on your printer's bed.";
const HEIGHT = "As tall as the box allows.";

function show(c: Component) {
  return render(<GrowthOptions component={c} index={0} onChange={vi.fn()} />);
}

/** The lines under a group's choice, whole (a group is the choice; its lines follow it). */
const lineUnder = (label: string): string[] =>
  [
    ...(screen
      .getByRole("group", { name: label })
      .closest(".ed-stack")
      ?.querySelectorAll(".ed-line") ?? []),
  ].map((el) => el.textContent ?? "");

describe("growthMaxLine", () => {
  it("says the footprint's Max is what fits beside the other trays and on the bed", () => {
    const upright = withGrowth(
      { ...of("cards"), storage: "upright-long" as const },
      "stack",
      "max",
    );
    expect(growthMaxLine(upright, "stack")).toBe(FOOTPRINT);
    const bulk = of("bulk");
    expect(growthMaxLine(bulk, "w")).toBe(FOOTPRINT);
    expect(growthMaxLine(bulk, "d")).toBe(FOOTPRINT);
    // a pocket's looseness is on the footprint too
    expect(growthMaxLine({ ...of("minis"), storage: "pockets" as const }, "w")).toBe(FOOTPRINT);
  });

  it("says the height's Max is what the box allows, for a height and for a deck lying flat", () => {
    expect(growthMaxLine(of("bulk"), "h")).toBe(HEIGHT);
    expect(growthMaxLine({ ...of("cards"), storage: "flat" as const }, "stack")).toBe(HEIGHT);
    expect(growthMaxLine({ ...of("tiles"), storage: "flat" as const }, "stack")).toBe(HEIGHT);
  });
});

describe("GrowthOptions: what Max means", () => {
  it("says it under the choice while Max is chosen", () => {
    const c = withGrowth({ ...of("cards"), storage: "upright-long" as const }, "stack", "max");
    show(c);
    expect(lineUnder("Room for expansions")).toEqual([FOOTPRINT]);
  });

  it("says nothing of it under any other choice", () => {
    for (const mode of ["off", "auto", 10] as const) {
      const c = withGrowth({ ...of("cards"), storage: "upright-long" as const }, "stack", mode);
      show(c);
      expect(lineUnder("Room for expansions"), String(mode)).toHaveLength(0);
      expect(screen.queryByText(FOOTPRINT)).toBeNull();
      cleanup();
    }
  });

  it("says it for each axis that is on Max, by what the axis is", () => {
    let c: Component = of("bulk");
    for (const axis of ["w", "d", "h"] as GrowthAxis[]) {
      c = withGrowth(c, axis, "max");
    }
    show(c);
    expect(lineUnder("Extra width")).toContain(FOOTPRINT);
    expect(lineUnder("Extra length")).toContain(FOOTPRINT);
    expect(lineUnder("Extra height")).toContain(HEIGHT);
  });

  it("describes the axis by its own group: the line sits with the choice it explains", () => {
    const c = withGrowth(withGrowth(of("bulk"), "w", "max"), "h", "max");
    show(c);
    const width = screen
      .getByRole("group", { name: "Extra width" })
      .closest(".ed-stack") as HTMLElement;
    const height = screen
      .getByRole("group", { name: "Extra height" })
      .closest(".ed-stack") as HTMLElement;
    expect(within(width).queryByText(HEIGHT)).toBeNull();
    expect(within(height).queryByText(FOOTPRINT)).toBeNull();
  });
});
