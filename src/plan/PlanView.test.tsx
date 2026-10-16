// src/plan/PlanView.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
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

/** Two components: tray A holds the deck, tray B the dice. */
const deck = { ...newComponent("cards"), name: "Region deck" };
const dice = { ...newComponent("bulk"), name: "Dice" };
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
  compartments: [holding("Region deck ×50")],
});
const B = makeTray({
  key: "b:p0:0",
  path: "1",
  stack: 1,
  x: 100,
  y: 0,
  w: 99,
  d: 99,
  compartments: [holding("Dice ×12")],
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

/** The app's part: keeps the layer and the swap under way (the props give their start), and reports changes. */
function Host(props: PlanViewProps) {
  const [level, setLevel] = useState(props.level);
  const [swapFrom, setSwapFrom] = useState(props.swapFrom);
  return (
    <PlanView
      {...props}
      level={level}
      onLevelChange={(l) => {
        props.onLevelChange(l);
        setLevel(l);
      }}
      swapFrom={swapFrom}
      onSwapFromChange={(key) => {
        props.onSwapFromChange(key);
        setSwapFrom(key);
      }}
    />
  );
}

function setup(over: Partial<PlanViewProps> = {}) {
  const p: PlanViewProps = {
    trays: [A, B, C],
    components: [deck, dice],
    box,
    settings: DEFAULT_SETTINGS,
    lockedKeys: new Set<string>(),
    selectedKey: null,
    onSelect: vi.fn(),
    onSwap: vi.fn(),
    sizeLockedKeys: new Set<string>(),
    level: 0,
    onLevelChange: vi.fn(),
    swapFrom: null,
    onSwapFromChange: vi.fn(),
    ...over,
  };
  const view = render(<Host {...p} />);
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
  it("labels trays by name, never by number", () => {
    const { svg } = setup({ trays: [A, B, C] });
    expect(screen.getByRole("button", { name: "Region deck, layer 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dice, layer 1" })).toBeTruthy();
    const tile = svg.querySelector('[data-key="a:p0:0"]');
    expect(tile?.querySelector(".plan-label")).toBeNull();
    expect(tile?.querySelector(".plan-pill")).toBeTruthy();
    expect(tile?.querySelector(".plan-name")?.textContent).toBe("Region deck");
    expect(tile?.querySelector("title")?.textContent).toBe("Region deck");
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("aria-label") ?? "").not.toMatch(/\bTray \d|#\d/);
    }
    for (const t of Array.from(svg.querySelectorAll(".plan-tray"))) {
      expect(t.textContent).not.toMatch(/^\d+$/);
      expect(t.querySelector("text")?.textContent).not.toMatch(/^\d+$/);
    }
  });

  it("says pinned and size locked in the name of a tray", () => {
    const { p, view } = setup();
    view.rerender(<Host {...p} lockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Region deck, layer 1, pinned" })).toBeTruthy();
    view.rerender(
      <Host {...p} lockedKeys={new Set(["a:p0:0"])} sizeLockedKeys={new Set(["a:p0:0"])} />,
    );
    expect(
      screen.getByRole("button", { name: "Region deck, layer 1, pinned, size locked" }),
    ).toBeTruthy();
  });

  it("gives each component of a kind its own shade, stable by component order", () => {
    const second = { ...newComponent("cards"), name: "Event deck" };
    const trays = [A, makeTray({ ...B, compartments: [holding("Event deck ×30")] })];
    const { svg } = setup({ trays, components: [deck, dice, second] });
    const fill = (key: string) =>
      (svg.querySelector(`[data-key="${key}"]`)?.getAttribute("style") ?? "").match(
        /--tile-fill:\s*([^;]+)/,
      )?.[1];
    // The first deck is the kind's base hue; the second is a shade of it, not the dice's index.
    expect(fill("a:p0:0")).toContain("#DCE6FA");
    expect(fill("b:p0:0")).toBeTruthy();
    expect(fill("b:p0:0")).not.toBe(fill("a:p0:0"));
    expect(fill("b:p0:0")).toContain("light-dark(");
  });

  it("shows the kind icon only on the selected tray", () => {
    const { svg, view, p } = setup();
    expect(svg.querySelector(".plan-glyph")).toBeNull();
    view.rerender(<Host {...p} selectedKey="a:p0:0" />);
    expect(svg.querySelectorAll(".plan-glyph")).toHaveLength(1);
    const glyph = svg.querySelector('[data-key="a:p0:0"] .plan-glyph');
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(glyph?.querySelector("rect, path")).toBeTruthy();
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-glyph')).toBeNull();
    view.rerender(<Host {...p} selectedKey="b:p0:0" />);
    expect(svg.querySelector('[data-key="a:p0:0"] .plan-glyph')).toBeNull();
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-glyph')).toBeTruthy();
  });

  it("shows the kind icon on the tray with the keyboard focus", () => {
    const { svg } = setup();
    // jsdom does not move the focus onto an SVG element: say that the focus ring is showing.
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ":focus-visible" || matches.call(this, selector);
    });
    fireEvent.focus(screen.getByRole("button", { name: "Dice, layer 1" }));
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-glyph')).toBeTruthy();
    expect(svg.querySelector('[data-key="a:p0:0"] .plan-glyph')).toBeNull();
  });

  it("lists the trays of the shown layer for screen readers", () => {
    const { view } = setup();
    const list = screen.getByRole("list", { name: "Trays on layer 1" });
    expect(list.getAttribute("class")).toContain("visually-hidden");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Region deck", "Dice"]);
    view.unmount();
    setup({ level: 1, lockedKeys: new Set(["c:p0:0"]) });
    const second = screen.getByRole("list", { name: "Trays on layer 2" });
    expect(within(second).getAllByRole("listitem")).toHaveLength(1);
    expect(second.textContent).toMatch(/, pinned$/);
  });

  it("selects a tray on tap", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
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
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      ...touch,
    });
    fireEvent.pointerMove(svg, { ...at(100, 49.5), ...touch });
    fireEvent.pointerMove(svg, { ...centerB, ...touch });
    expect(screen.getByRole("button", { name: /^Dice/ }).getAttribute("class")).toContain(
      "is-drop",
    );
    fireEvent.pointerUp(svg, { ...centerB, ...touch });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("pointercancel resets the drag", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerB, pointerId: 2 });
    fireEvent.pointerCancel(svg, { pointerId: 2 });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 2 });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Dice/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
  });

  it("a lost pointer capture ends the drag like a cancel", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerB, pointerId: 2 });
    fireEvent.lostPointerCapture(svg, { pointerId: 2 });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 2 });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Dice/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
  });

  it("does not drag leftovers or drop onto them", () => {
    const { p, svg } = setup({ trays: [A, B, L2] });
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 3,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerL2, pointerId: 3 });
    expect(screen.getByRole("button", { name: /^Spare/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
    fireEvent.pointerUp(svg, { ...centerL2, pointerId: 3 });
    expect(p.onSwap).not.toHaveBeenCalled();
    // A leftover can't start a drag either, but a tap still selects it.
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Spare/ }), {
      ...centerL2,
      pointerId: 4,
      button: 0,
    });
    fireEvent.pointerMove(svg, { ...centerA, pointerId: 4 });
    expect(
      screen.getByRole("button", { name: /^Region deck/ }).getAttribute("class"),
    ).not.toContain("is-drop");
    expect(screen.getByRole("button", { name: /^Spare/ }).getAttribute("class")).not.toContain(
      "is-source",
    );
    fireEvent.pointerUp(svg, { ...centerA, pointerId: 4 });
    expect(p.onSwap).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Spare/ }), {
      ...centerL2,
      pointerId: 5,
      button: 0,
    });
    fireEvent.pointerUp(svg, { ...centerL2, pointerId: 5 });
    expect(p.onSelect).toHaveBeenCalledWith("leftover:1");
  });

  it("says next to the plan why a drag cannot swap", () => {
    const { p, svg } = setup({ trays: [A, B, L2] });
    const a = screen.getByRole("button", { name: /^Region deck/ });
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
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Spare/ }), {
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
    expect(screen.getByRole("status").textContent).toBe(""); // still there, saying nothing
  });

  it("refuses a leftover as the swap partner and cannot start a swap from one", () => {
    const { p } = setup({ trays: [A, B, L2], selectedKey: "a:p0:0", swapFrom: "a:p0:0" });
    fireEvent.keyDown(screen.getByRole("button", { name: /^Spare/ }), { key: "Enter" });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/can't be swapped/);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Dice/ }), { key: "Enter" });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("clears the selection and swap mode on Escape wherever the focus is", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0", swapFrom: "a:p0:0" });
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: /^Region deck/ }), { key: "Escape" });
    expect(p.onSelect).toHaveBeenCalledWith(null);
    expect(screen.getByRole("status").textContent).toBe(""); // still there, saying nothing
    expect(view.container.querySelectorAll("[data-key]").length).toBeGreaterThan(0);
  });

  it("ignores the cancel of another pointer and a second press during a drag", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Dice/ }), {
      ...centerB,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 2 });
    expect(p.onSelect).not.toHaveBeenCalled();
    fireEvent.pointerMove(svg, { ...centerB, pointerId: 1 });
    fireEvent.pointerCancel(svg, { pointerId: 3 });
    expect(screen.getByRole("button", { name: /^Dice/ }).getAttribute("class")).toContain(
      "is-drop",
    );
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 1 });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("recovers when a pointerup never came: the same pointer pressing again starts afresh", () => {
    const { p, svg } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 1,
      button: 0,
    });
    // No pointerup or pointercancel (a lost capture): the next press is the same pointer.
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Dice/ }), {
      ...centerB,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(svg, { ...centerB, pointerId: 1 });
    expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
    expect(p.onSwap).not.toHaveBeenCalled();
  });

  it("swaps with the keyboard: select, start a swap from the tray bar, Enter on the other tray", () => {
    const { p } = setup({ selectedKey: "a:p0:0", swapFrom: "a:p0:0" });
    expect(screen.getByRole("status").textContent).toMatch(/Choose the tray to swap with/);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Dice/ }), { key: "Enter" });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("marks pinned and size-locked trays on the tile and in the name", () => {
    const { p, view } = setup();
    view.rerender(<Host {...p} sizeLockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Region deck, layer 1, size locked" })).toBeTruthy();
    expect(screen.getByText("size locked")).toBeTruthy();
    view.rerender(<Host {...p} lockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Region deck, layer 1, pinned" })).toBeTruthy();
    expect(screen.getByText("pinned")).toBeTruthy();
  });

  it("switches layers", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Layer 2 (top)"));
    expect(screen.getByRole("button", { name: /layer 2/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /layer 1/ })).toBeNull();
  });

  it("labels the layers bottom to top, and has no switch for one layer", () => {
    const top = makeTray({ ...C, key: "d:p0:0", level: 2 });
    const { view } = setup({ trays: [A, B, C, top] });
    const labels = Array.from(view.container.querySelectorAll(".layer-picker label")).map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(["Layer 1 (bottom)", "Layer 2", "Layer 3 (top)"]);
    view.unmount();
    setup({ trays: [A, B] });
    expect(document.querySelector(".layer-picker")).toBeNull();
  });

  it("the layer switch is controlled by the app", () => {
    const { p, view } = setup({ level: 1 });
    // the layer comes from the prop: layer 2 is shown and its radio is checked
    expect((screen.getByLabelText("Layer 2 (top)") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: /layer 2/ })).toBeTruthy();
    // choosing a layer reports it
    fireEvent.click(screen.getByLabelText("Layer 1 (bottom)"));
    expect(p.onLevelChange).toHaveBeenCalledWith(0);
    expect(screen.getByRole("button", { name: "Region deck, layer 1" })).toBeTruthy();
    view.unmount();
    // without a parent that follows, the shown layer does not change on its own
    const onLevelChange = vi.fn();
    render(<PlanView {...p} level={1} onLevelChange={onLevelChange} />);
    fireEvent.click(screen.getByLabelText("Layer 1 (bottom)"));
    expect(onLevelChange).toHaveBeenCalledWith(0);
    expect(screen.getByRole("button", { name: /layer 2/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /layer 1/ })).toBeNull();
  });

  it("brings a layer past the last one back in range", () => {
    const onLevelChange = vi.fn();
    const { p } = setup({ level: 5, onLevelChange });
    expect(p.onLevelChange).toHaveBeenCalledWith(1);
    expect(screen.getByRole("button", { name: /layer 2/ })).toBeTruthy();
  });

  it("keeps the swap under way in the app, and ends it when the selection is cleared", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0", swapFrom: "a:p0:0" });
    const note = screen.getByRole("status");
    expect(note.textContent).toMatch(/Choose the tray to swap with/);
    // the note's region is the same element before and after: a reader hears the change
    view.rerender(<Host {...p} selectedKey={null} />);
    expect(screen.getByRole("status")).toBe(note);
    view.rerender(<Host {...p} selectedKey="a:p0:0" swapFrom="a:p0:0" />);
    expect(screen.getByRole("status")).toBe(note);
    view.rerender(<Host {...p} selectedKey={null} />);
    expect(p.onSwapFromChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("status").textContent).toBe(""); // still there, saying nothing
  });

  it("ends a swap when the selection moves to another tray", () => {
    const { p, view } = setup({ selectedKey: "a:p0:0", swapFrom: "a:p0:0" });
    expect(screen.getByRole("status").textContent).toMatch(/Choose the tray to swap with/);
    view.rerender(<Host {...p} selectedKey="b:p0:0" />);
    expect(p.onSwapFromChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("status").textContent).toBe(""); // still there, saying nothing
  });

  it("shows the name and size on a tile, and keeps the unit out of it", () => {
    const { svg } = setup();
    const tile = svg.querySelector('[data-key="a:p0:0"]');
    expect(tile?.querySelector(".plan-name")?.textContent).toBe("Region deck");
    expect(tile?.querySelector(".plan-size")?.textContent).toBe("90 × 99");
    expect(tile?.querySelector("text[aria-hidden]")).toBeTruthy();
  });

  it("truncates a long name, keeping the whole of it in the name and title, and drops the text on a tiny tile", () => {
    const longName = { ...newComponent("cards"), name: "A very long component name" };
    const long = makeTray({
      ...A,
      w: 40,
      compartments: [holding("A very long component name")],
    });
    const tiny = makeTray({ ...B, w: 8, d: 8 });
    const { svg } = setup({ trays: [long, tiny], components: [longName, dice] });
    const name = svg.querySelector('[data-key="a:p0:0"] .plan-name')?.textContent ?? "";
    expect(name.endsWith("…")).toBe(true);
    expect(name.length).toBeLessThan("A very long component name".length);
    expect(svg.querySelector('[data-key="a:p0:0"] title')?.textContent).toBe(
      "A very long component name",
    );
    expect(
      screen.getByRole("button", { name: "A very long component name, layer 1" }),
    ).toBeTruthy();
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-pill')).toBeNull();
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-name')).toBeNull();
    expect(svg.querySelector('[data-key="b:p0:0"] .plan-size')).toBeNull();
    expect(screen.getByRole("button", { name: "Dice, layer 1" })).toBeTruthy();
  });

  it("draws a spare tray hatched with a dashed edge, with a legend, and no glyph", () => {
    const { svg } = setup({
      trays: [A, B, { ...L2, w: 60, d: 40 }],
      selectedKey: "leftover:1",
    });
    const spare = svg.querySelector('[data-key="leftover:1"]');
    expect(spare?.getAttribute("class")).toContain("is-leftover");
    expect(spare?.querySelector(".plan-glyph")).toBeNull();
    expect(spare?.querySelector(".plan-name")?.textContent).toMatch(/^Spare/);
    expect(svg.querySelector("defs pattern#plan-hatch")).toBeTruthy();
    expect(planCss).toMatch(/\.plan-tray\.is-leftover \.plan-face\s*{[^}]*url\("#plan-hatch"\)/);
    expect(planCss).toMatch(/\.plan-tray\.is-leftover \.plan-face\s*{[^}]*stroke-dasharray/);
    expect(planCss).toMatch(/--spacer-dash/);
    expect(screen.getByText(/Hatched trays are spares/).getAttribute("class")).toContain(
      "plan-legend",
    );
  });

  it("has no spare-tray legend without a spare tray", () => {
    setup();
    expect(screen.queryByText(/Hatched trays are spares/)).toBeNull();
  });

  it("greys out a stale plan by class, not by opacity", () => {
    const { svg, view, p } = setup();
    expect(svg.getAttribute("class")).not.toContain("is-stale");
    view.rerender(<Host {...p} stale />);
    expect(view.container.querySelector("svg")?.getAttribute("class")).toContain("is-stale");
    expect(planCss).toMatch(/\.plan-svg\.is-stale\s*{[^}]*grayscale\(0\.8\)/);
  });

  it("shows the tray bar it is given under the drawing", () => {
    const { svg } = setup({ selectedKey: "a:p0:0", bar: <p>The tray bar</p> });
    const bar = screen.getByText("The tray bar");
    expect(svg.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByLabelText("Layer 1 (bottom)")).toBeTruthy();
  });
});

describe("a merged filler on the plan", () => {
  it("is one tile per member on the layer it stands on, all with one number and one key", () => {
    const { view } = setup({ trays: [A, B, C, M] });
    const merged = view.container.querySelectorAll('[data-key="merged:0"]');
    // one group, drawn as the members of the layer (layer 1: the ground filler)
    expect(merged).toHaveLength(1);
    expect(merged[0]?.querySelectorAll("rect.plan-face")).toHaveLength(1);
    expect(merged[0]?.querySelector("title")?.textContent).toMatch(/^Spare/);
    expect(merged[0]?.classList.contains("is-leftover")).toBe(true);
  });

  it("shows its other member on the next layer, and is selected from either", () => {
    const onSelect = vi.fn();
    const { view } = setup({ trays: [A, B, C, M], onSelect });
    fireEvent.click(screen.getByRole("radio", { name: /Layer 2/ }));
    const merged = view.container.querySelector('[data-key="merged:0"]');
    expect(merged?.querySelectorAll("rect.plan-face")).toHaveLength(1);
    fireEvent.keyDown(merged as Element, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("merged:0");
  });

  it("draws the ring round every member of a selected merged part", () => {
    const { view } = setup({ trays: [A, B, C, M], selectedKey: "merged:0" });
    expect(view.container.querySelectorAll("rect.plan-ring.is-selected")).toHaveLength(1);
  });
});
