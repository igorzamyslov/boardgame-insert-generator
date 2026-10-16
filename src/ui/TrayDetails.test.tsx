// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTray } from "../app/test-helpers";
import { numberParts } from "../instructions/numbering";
import { DEFAULT_SETTINGS } from "../model/settings";
import { TrayDetails } from "./TrayDetails";
import type { TrayDetailsProps } from "./TrayDetails";

afterEach(cleanup);

const tray = makeTray({ key: "a:p0:0" });
const spacer = makeTray({ key: "a:p0:0:spacer", part: "spacer", compartments: [] });

function part(spec: ReturnType<typeof makeTray>) {
  const found = numberParts([tray, spacer]).find((p) => p.spec.key === spec.key);
  if (!found) {
    throw new Error("part not found");
  }
  return found;
}

function view(over: Partial<TrayDetailsProps> = {}) {
  return render(
    <TrayDetails part={part(tray)} settings={DEFAULT_SETTINGS} locked={false} {...over} />,
  );
}

describe("TrayDetails", () => {
  it("is a polite live group named Selected tray", () => {
    view();
    const group = screen.getByRole("group", { name: "Selected tray" });
    expect(group.getAttribute("aria-live")).toBe("polite");
    expect(group.classList.contains("tray-details")).toBe(true);
  });

  it("shows everything", () => {
    view({ onToggleSizeLock: vi.fn() });
    for (const label of ["Outer size", "Layer", "Position", "Position locked", "Size locked"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Lock size" })).toBeTruthy();
  });

  it("says a spacer sits on its tray", () => {
    view({ part: part(spacer) });
    expect(screen.getByText("Sits on")).toBeTruthy();
    expect(screen.getByText("Tray #1")).toBeTruthy();
    expect(screen.queryByText("Goes into")).toBeNull();
  });

  it("toggles the size lock", () => {
    const toggle = vi.fn();
    view({ onToggleSizeLock: toggle });
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});

describe("TrayDetails of a merged part", () => {
  const filler = makeTray({ key: "leftover:0", part: "leftover", solid: true, compartments: [] });
  const riser = makeTray({ key: "a:p0:0:riser", part: "riser", compartments: [] });
  const mergedSpec = (members: ReturnType<typeof makeTray>[], flipped: boolean) =>
    makeTray({
      key: "merged:0",
      part: "leftover",
      solid: true,
      compartments: [],
      merged: { members, bridges: [], flipped },
    });
  const show = (spec: ReturnType<typeof makeTray>) => {
    const p = numberParts([spec]).find((x) => x.spec.key === spec.key);
    if (!p) {
      throw new Error("part not found");
    }
    return render(<TrayDetails part={p} settings={DEFAULT_SETTINGS} locked={false} />);
  };

  it("says what it joins", () => {
    show(mergedSpec([filler, { ...filler, key: "leftover:1" }], false));
    expect(screen.getByText("Joins")).toBeTruthy();
    expect(screen.getByText("2 fillers, printed as one part.")).toBeTruthy();
  });

  it("counts a riser folded in", () => {
    show(mergedSpec([riser, filler], false));
    expect(screen.getByText("1 filler and a riser, printed as one part.")).toBeTruthy();
  });

  it("tells you to print one with members on different floors upside down", () => {
    show(mergedSpec([filler, { ...filler, key: "leftover:1", z: 28 }], true));
    expect(screen.getByText(/Print it upside down, the flat top on the bed/)).toBeTruthy();
  });

  it("has no Joins row for any other part", () => {
    view();
    expect(screen.queryByText("Joins")).toBeNull();
  });
});
