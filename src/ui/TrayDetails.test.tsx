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

  it("shows everything by default", () => {
    view({ onToggleSizeLock: vi.fn() });
    for (const label of ["Outer size", "Layer", "Position", "Position locked", "Size locked"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Lock size" })).toBeTruthy();
  });

  it("hides positions, locks and the size lock when not advanced", () => {
    view({ advanced: false, onToggleSizeLock: vi.fn() });
    expect(screen.getByRole("heading", { name: /^#1 / })).toBeTruthy();
    expect(screen.getByText("Outer size")).toBeTruthy();
    expect(screen.getByText("Layer")).toBeTruthy();
    expect(screen.getByText("Deck A ×40")).toBeTruthy();
    for (const label of ["Position", "Position locked", "Size locked"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByRole("button", { name: /size/i })).toBeNull();
    expect(screen.queryByText(/keeps this outer size/)).toBeNull();
  });

  it("says a spacer sits on its tray, with or without the advanced rows", () => {
    const { unmount } = view({ part: part(spacer), advanced: false });
    expect(screen.getByText("Sits on")).toBeTruthy();
    expect(screen.getByText("Tray #1")).toBeTruthy();
    expect(screen.queryByText("Goes into")).toBeNull();
    unmount();
    view({ part: part(spacer) });
    expect(screen.getByText("Sits on")).toBeTruthy();
  });

  it("toggles the size lock", () => {
    const toggle = vi.fn();
    view({ onToggleSizeLock: toggle });
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
