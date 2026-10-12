// src/plan/PlanView.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import planCss from "./plan.css?raw";
import { planFrame, planViewBox } from "./layers";
import { PlanView } from "./PlanView";
import type { PlanViewProps } from "./PlanView";

beforeAll(() => {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    Object.defineProperty(window, "PointerEvent", {
      value: PointerEventPolyfill,
      configurable: true,
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const box = { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 100 };
const vb = planViewBox(planFrame(box, DEFAULT_SETTINGS));
const A = makeTray({
  key: "a:p0:0",
  path: "0",
  stack: 0,
  x: 0,
  y: 0,
  w: 90,
  d: 99,
  compartments: [],
});
const B = makeTray({
  key: "b:p0:0",
  path: "1",
  stack: 1,
  x: 100,
  y: 0,
  w: 99,
  d: 99,
  compartments: [],
});
const C = makeTray({
  key: "c:p0:0",
  path: "0",
  stack: 0,
  level: 1,
  x: 1.45,
  y: 1.45,
  w: 87,
  d: 96,
  compartments: [],
});
const L = makeTray({
  key: "leftover:0",
  part: "leftover",
  path: "11",
  stack: 2,
  x: 0,
  y: 0,
  w: 5,
  d: 5,
  compartments: [],
});

const L2 = makeTray({
  key: "leftover:1",
  part: "leftover",
  path: "12",
  stack: 3,
  x: 91,
  y: 0,
  w: 8,
  d: 8,
  compartments: [],
});
const centerL2 = at(95, 4);

/** Client pixel of an SVG point: the SVG is laid out 1 px per mm at (0, 0). */
function at(svgX: number, svgY: number) {
  return { clientX: svgX - vb.x, clientY: svgY - vb.y };
}

function setup(over: Partial<PlanViewProps> = {}) {
  const p: PlanViewProps = {
    trays: [A, B, C],
    box,
    settings: DEFAULT_SETTINGS,
    lockedKeys: new Set<string>(),
    selectedKey: null,
    onSelect: vi.fn(),
    onSwap: vi.fn(),
    onToggleLock: vi.fn(),
    sizeLockedKeys: new Set<string>(),
    onToggleSizeLock: vi.fn(),
    ...over,
  };
  const view = render(<PlanView {...p} />);
  const svg = view.container.querySelector("svg");
  if (!svg) {
    throw new Error("no svg");
  }
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: vb.w,
    bottom: vb.h,
    width: vb.w,
    height: vb.h,
  };
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ ...rect, toJSON: () => rect });
  return { p, view, svg };
}

const centerA = at(45, 49.5);
const centerB = at(149.5, 49.5);

describe("PlanView", () => {
  it("labels trays with their part numbers", () => {
    setup();
    expect(screen.getByRole("button", { name: "Tray 1: a:p0:0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tray 3: b:p0:0" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /c:p0:0/ })).toBeNull();
  });

  it("selects a tray on tap", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), {
      ...centerA,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(svg, { ...centerA, pointerId: 1 });
    expect(p.onSelect).toHaveBeenCalledWith("a:p0:0");
    expect(p.onSwap).not.toHaveBeenCalled();
  });

  it("touch drag swaps; svg has touch-action none", () => {
    expect(planCss).toMatch(/\.plan-svg\s*{[^}]*touch-action:\s*none/);
    const { p, svg } = setup();
    // The stylesheet rule applies to the element PlanView renders.
    expect(svg.getAttribute("class")).toContain("plan-svg");
    const touch = { pointerId: 7, pointerType: "touch", button: 0 };
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), { ...centerA, ...touch });
    fireEvent.pointerMove(svg, { ...at(100, 49.5), ...touch });
    fireEvent.pointerMove(svg, { ...centerB, ...touch });
    expect(screen.getByRole("button", { name: /b:p0:0/ }).getAttribute("class")).toContain(
      "is-drop",
    );
    fireEvent.pointerUp(svg, { ...centerB, ...touch });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("pointercancel resets the drag", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), {
      ...centerA,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerB, pointerId: 2 });
    fireEvent.pointerCancel(svg, { pointerId: 2 });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 2 });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /b:p0:0/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
  });

  it("does not drag leftovers or drop onto them", () => {
    const { p, svg } = setup({ trays: [A, B, L2] });
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), {
      ...centerA,
      pointerId: 3,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerL2, pointerId: 3 });
    expect(screen.getByRole("button", { name: /Spare tray/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
    fireEvent.pointerUp(svg, { ...centerL2, pointerId: 3 });
    expect(p.onSwap).not.toHaveBeenCalled();
    // A leftover can't start a drag either, but a tap still selects it.
    fireEvent.pointerDown(screen.getByRole("button", { name: /Spare tray/ }), {
      ...centerL2,
      pointerId: 4,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerA, pointerId: 4 });
    expect(screen.getByRole("button", { name: /a:p0:0/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
    expect(screen.getByRole("button", { name: /Spare tray/ }).getAttribute("class")).not.toContain(
      "is-source",
    );
    fireEvent.pointerUp(svg, { ...centerA, pointerId: 4 });
    expect(p.onSwap).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button", { name: /Spare tray/ }), {
      ...centerL2,
      pointerId: 5,
      button: 0,
    });
    fireEvent.pointerUp(svg, { ...centerL2, pointerId: 5 });
    expect(p.onSelect).toHaveBeenCalledWith("leftover:1");
  });

  it("refuses a leftover as the swap partner and cannot start a swap from one", () => {
    const { p, view } = setup({ trays: [A, B, L2], selectedKey: "a:p0:0" });
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /Spare tray/ }), { key: "Enter" });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/can't be swapped/);
    fireEvent.keyDown(screen.getByRole("button", { name: /b:p0:0/ }), { key: "Enter" });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
    view.rerender(<PlanView {...p} selectedKey="leftover:1" />);
    expect(screen.getByRole("button", { name: "Swap with…" }).hasAttribute("disabled")).toBe(true);
  });

  it("clears the selection and swap mode on Escape wherever the focus is", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0" });
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Swap with…" }), { key: "Escape" });
    expect(p.onSelect).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("status")).toBeNull();
    expect(view.container.querySelectorAll("[data-key]").length).toBeGreaterThan(0);
  });

  it("ignores the cancel of another pointer and a second press during a drag", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), {
      ...centerA,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerDown(screen.getByRole("button", { name: /b:p0:0/ }), {
      ...centerB,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 2 });
    expect(p.onSelect).not.toHaveBeenCalled();
    fireEvent.pointerMove(svg, { ...centerB, pointerId: 1 });
    fireEvent.pointerCancel(svg, { pointerId: 3 });
    expect(screen.getByRole("button", { name: /b:p0:0/ }).getAttribute("class")).toContain(
      "is-drop",
    );
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 1 });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("recovers when a pointerup never came: the same pointer pressing again starts afresh", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), {
      ...centerA,
      pointerId: 1,
      button: 0,
    });
    // No pointerup or pointercancel (a lost capture): the next press is the same pointer.
    fireEvent.pointerDown(screen.getByRole("button", { name: /b:p0:0/ }), {
      ...centerB,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 1 });
    expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
    expect(p.onSwap).not.toHaveBeenCalled();
  });

  it("swaps with the keyboard: select, Swap with…, Enter on the other tray", () => {
    const { p, view } = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: /a:p0:0/ }), { key: "Enter" });
    expect(p.onSelect).toHaveBeenCalledWith("a:p0:0");
    view.rerender(<PlanView {...p} selectedKey="a:p0:0" />);
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    expect(screen.getByRole("status").textContent).toMatch(/Choose the tray to swap with/);
    fireEvent.keyDown(screen.getByRole("button", { name: /b:p0:0/ }), { key: "Enter" });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("toggles the lock of the selected tray and refuses leftovers", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0" });
    fireEvent.click(screen.getByRole("button", { name: "Lock position" }));
    expect(p.onToggleLock).toHaveBeenCalledWith("a:p0:0");
    view.rerender(<PlanView {...p} lockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Tray 1: a:p0:0, locked" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock position" })).toBeTruthy();
    view.rerender(<PlanView {...p} trays={[A, B, L]} selectedKey="leftover:0" />);
    expect(screen.getByRole("button", { name: "Lock position" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("toggles the size lock of the selected tray and marks size-locked trays", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0" });
    expect(screen.getByText("Size locked").nextElementSibling?.textContent).toBe("No");
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(p.onToggleSizeLock).toHaveBeenCalledWith("a:p0:0");
    view.rerender(<PlanView {...p} sizeLockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Tray 1: a:p0:0, size locked" })).toBeTruthy();
    expect(screen.getByText("size locked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock size" })).toBeTruthy();
    view.rerender(<PlanView {...p} trays={[A, B, L]} selectedKey="leftover:0" />);
    expect(screen.queryByRole("button", { name: "Lock size" })).toBeNull();
  });

  it("shows a lipped tray's printed height, lip included", () => {
    setup({ selectedKey: "a:p0:0", trays: [{ ...A, h: 40, lip: true }, B, C] });
    expect(screen.getByText("Outer size").nextElementSibling?.textContent).toBe(
      `90.0 × 99.0 × ${(40 + DEFAULT_SETTINGS.lip.height).toFixed(1)} mm with its lip`,
    );
  });

  it("switches layers", () => {
    setup();
    fireEvent.click(screen.getByLabelText("2"));
    expect(screen.getByRole("button", { name: /c:p0:0/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /a:p0:0/ })).toBeNull();
  });
});
