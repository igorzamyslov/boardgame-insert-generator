// src/plan/PlanView.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX, newComponent } from "../model/defaults";
import type { CompartmentSpec } from "../model/types";
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
const centerL2 = at(95, 95);

/** Two fillers, one beside the stack and one on top of it, printed as one part. */
const M = makeTray({
  key: "merged:0",
  part: "leftover",
  path: "",
  stack: 2,
  level: 0,
  x: 91,
  y: 0,
  w: 8,
  d: 99,
  compartments: [],
  merged: {
    members: [
      { ...L2, x: 91, y: 0, w: 8, d: 60 },
      { ...L2, key: "leftover:2", x: 91, y: 60.2, w: 8, d: 39, level: 1 },
    ],
    bridges: [],
    flipped: true,
  },
});

function holding(contents: string): CompartmentSpec {
  return { x: 1, y: 1, w: 10, d: 10, floorZ: 1, kind: "well", features: [], contents };
}

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
    advanced: true,
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
    expect(
      screen.getByRole("button", { name: "Tray 1, a:p0:0, 90 by 99 millimetres" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tray 3, b:p0:0, 99 by 99 millimetres" }),
    ).toBeTruthy();
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

  it("hints that the details of a stale layout may not match the inputs", () => {
    const { view, p } = setup({ selectedKey: "a:p0:0" });
    expect(screen.queryByText(/Inputs changed/)).toBeNull();
    view.rerender(<PlanView {...p} stale />);
    expect(screen.getByText(/Inputs changed — .*update the plan/i)).toBeTruthy();
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

  it("a lost pointer capture ends the drag like a cancel", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /a:p0:0/ }), {
      ...centerA,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerB, pointerId: 2 });
    fireEvent.lostPointerCapture(svg, { pointerId: 2 });
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

  it("says next to the plan why a drag cannot swap", () => {
    const { p, svg } = setup({ trays: [A, B, L2] });
    const a = screen.getByRole("button", { name: /a:p0:0/ });
    // Over a leftover: refused, with a visible message.
    fireEvent.pointerDown(a, { ...centerA, pointerId: 1, button: 0 });
    fireEvent.pointerMove(svg, { ...centerL2, pointerId: 1 });
    expect(screen.getByRole("status").textContent).toMatch(/can't be swapped with/);
    fireEvent.pointerUp(svg, { ...centerL2, pointerId: 1 });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/can't be swapped with/);
    // Released over empty space: nothing happens, and it says so.
    fireEvent.pointerDown(a, { ...centerA, pointerId: 2, button: 0 });
    fireEvent.pointerMove(svg, { ...at(95, 50), pointerId: 2 });
    fireEvent.pointerUp(svg, { ...at(95, 50), pointerId: 2 });
    expect(screen.getByRole("status").textContent).toMatch(/Nothing was swapped/);
    // Dragging a leftover is refused with a message; a valid swap clears it.
    fireEvent.pointerDown(screen.getByRole("button", { name: /Spare tray/ }), {
      ...centerL2,
      pointerId: 3,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerA, pointerId: 3 });
    expect(screen.getByRole("status").textContent).toMatch(/can't be dragged/);
    fireEvent.pointerUp(svg, { ...centerA, pointerId: 3 });
    fireEvent.pointerDown(a, { ...centerA, pointerId: 4, button: 0 });
    fireEvent.pointerMove(svg, { ...centerB, pointerId: 4 });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 4 });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
    expect(screen.queryByRole("status")).toBeNull();
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
    expect(
      screen.getByRole("button", { name: "Tray 1, a:p0:0, 90 by 99 millimetres, locked" }),
    ).toBeTruthy();
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
    expect(
      screen.getByRole("button", { name: "Tray 1, a:p0:0, 90 by 99 millimetres, size locked" }),
    ).toBeTruthy();
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
    fireEvent.click(screen.getByLabelText("Layer 2"));
    expect(screen.getByRole("button", { name: /c:p0:0/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /a:p0:0/ })).toBeNull();
  });

  it("shows the name and size on a tile, and keeps the unit out of it", () => {
    const named = makeTray({
      ...A,
      compartments: [holding("Region tiles")],
    });
    const { svg } = setup({ trays: [named, B] });
    const tile = svg.querySelector('[data-key="a:p0:0"]');
    expect(tile?.querySelector(".plan-label")?.textContent).toBe("1");
    expect(tile?.querySelector(".plan-name")?.textContent).toBe("Region tiles");
    expect(tile?.querySelector(".plan-size")?.textContent).toBe("90 × 99");
    expect(tile?.querySelector("[aria-hidden]")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tray 1, Region tiles, 90 by 99 millimetres" }),
    ).toBeTruthy();
  });

  it("truncates a long name and drops the lines on a tiny tile", () => {
    const long = makeTray({
      ...A,
      w: 40,
      compartments: [holding("A very long component name")],
    });
    const tiny = makeTray({ ...B, w: 8, d: 8 });
    const { svg } = setup({ trays: [long, tiny] });
    const name = svg.querySelector('[data-key="a:p0:0"] .plan-name')?.textContent ?? "";
    expect(name.endsWith("…")).toBe(true);
    expect(name.length).toBeLessThan("A very long component name".length);
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-label')).toBeTruthy();
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-name')).toBeNull();
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-size')).toBeNull();
  });

  it("draws a spare tray plain and dashed, with a legend, and no glyph", () => {
    const { svg } = setup({ trays: [A, B, { ...L2, w: 60, d: 40 }] });
    const spare = svg.querySelector('[data-key="leftover:1"]');
    expect(spare?.getAttribute("class")).toContain("is-leftover");
    expect(spare?.querySelector(".plan-glyph")).toBeNull();
    expect(spare?.querySelector(".plan-name")?.textContent).toBe("Spare tray");
    expect(planCss).toMatch(/\.plan-tray\.is-leftover rect\s*{[^}]*stroke-dasharray/);
    expect(screen.getByText(/Plain trays are spares/).getAttribute("class")).toContain(
      "plan-legend",
    );
  });

  it("has no spare-tray legend without a spare tray", () => {
    setup();
    expect(screen.queryByText(/Plain trays are spares/)).toBeNull();
  });

  it("greys out a stale plan by class, not by opacity", () => {
    const { svg, view, p } = setup();
    expect(svg.getAttribute("class")).not.toContain("is-stale");
    view.rerender(<PlanView {...p} stale />);
    expect(view.container.querySelector("svg")?.getAttribute("class")).toContain("is-stale");
    expect(planCss).toMatch(/\.plan-svg\.is-stale\s*{[^}]*grayscale\(0\.8\)/);
  });

  it("shows the lock and swap buttons only in advanced mode", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0", advanced: false });
    expect(screen.getByRole("heading", { name: /#1/ })).toBeTruthy();
    for (const name of ["Lock position", "Lock size", "Swap with…"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    view.rerender(<PlanView {...p} advanced />);
    for (const name of ["Lock position", "Lock size", "Swap with…"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("puts the kind glyph of a component on its tray", () => {
    const cards = { ...newComponent("cards"), name: "Region deck" };
    const held = makeTray({
      ...A,
      compartments: [holding("Region deck ×50")],
    });
    const { svg } = setup({ trays: [held, B], components: [cards] });
    const glyph = svg.querySelector('[data-key="a:p0:0"] .plan-glyph');
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(glyph?.querySelector("rect, path")).toBeTruthy();
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-glyph')).toBeNull();
  });

  it("draws the selection ring after the tiles", () => {
    const { svg } = setup({ selectedKey: "a:p0:0" });
    const last = svg.querySelector(".plan-ring.is-selected");
    expect(last).toBeTruthy();
    expect(last?.compareDocumentPosition(svg.querySelector('[data-key="b:p0:0"]') as Element)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it("offers a segmented layer picker", () => {
    const { view } = setup();
    expect(view.container.querySelector("fieldset.layer-picker .pf-seg .pf-seg__opt")).toBeTruthy();
    expect(screen.getByLabelText("Layer 1")).toBeTruthy();
  });
});

describe("a merged filler on the plan", () => {
  it("is one tile per member on the layer it stands on, all with one number and one key", () => {
    const { view } = setup({ trays: [A, B, C, M] });
    const merged = view.container.querySelectorAll('[data-key="merged:0"]');
    // one group, drawn as the members of the layer (layer 1: the ground filler)
    expect(merged).toHaveLength(1);
    expect(merged[0]?.querySelectorAll("rect")).toHaveLength(1);
    expect(merged[0]?.textContent).toMatch(/^\d/);
    expect(merged[0]?.classList.contains("is-leftover")).toBe(true);
  });

  it("shows its other member on the next layer, and is selected from either", () => {
    const onSelect = vi.fn();
    const { view } = setup({ trays: [A, B, C, M], onSelect });
    fireEvent.click(screen.getByRole("radio", { name: /Layer 2/ }));
    const merged = view.container.querySelector('[data-key="merged:0"]');
    expect(merged?.querySelectorAll("rect")).toHaveLength(1);
    fireEvent.keyDown(merged as Element, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("merged:0");
  });

  it("draws the ring round every member of a selected merged part", () => {
    const { view } = setup({ trays: [A, B, C, M], selectedKey: "merged:0" });
    expect(view.container.querySelectorAll("rect.plan-ring.is-selected")).toHaveLength(1);
  });
});
