// src/plan/PlanView.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { makeTray } from "../app/test-helpers";
import { DEFAULT_BOX, newComponent } from "../model/defaults";
import type { CompartmentSpec } from "../model/types";
import { DEFAULT_SETTINGS } from "../model/settings";
import { hoveredComponent } from "../screens/hover";
import { shadeHex } from "../ui/identity";
import planCss from "./plan.css?raw";
import { planFrame } from "./layers";
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
  vi.unstubAllGlobals();
  hoveredComponent.value = null;
});

/** A phone: the width query the app asks (below 760 px) answers yes. */
function phone(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(width < 760px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** Two components: tray A holds the deck, tray B the dice. */
const deck = { ...newComponent("cards"), name: "Region deck" };
const dice = { ...newComponent("bulk"), name: "Dice" };
const insertBox = { ...DEFAULT_BOX, innerWidth: 200, innerDepth: 100 };
const frame = planFrame(insertBox, DEFAULT_SETTINGS);
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

/** Client pixel of a plan point: the floor is laid out 1 px per mm at (0, 0), the plan starting the clearance in. */
function at(planX: number, planY: number) {
  return { clientX: planX + frame.bc, clientY: planY + frame.bc };
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
    box: insertBox,
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
  const box = view.container.querySelector<HTMLElement>(".plan-box");
  const floor = view.container.querySelector<HTMLElement>(".plan-floor");
  if (!box || !floor) {
    throw new Error("no plan box");
  }
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: frame.innerW,
    bottom: frame.innerD,
    width: frame.innerW,
    height: frame.innerD,
  };
  vi.spyOn(floor, "getBoundingClientRect").mockReturnValue({ ...rect, toJSON: () => rect });
  return { p, view, box };
}

const centerA = at(45, 49.5);
const centerB = at(149.5, 49.5);

describe("PlanView", () => {
  it("labels trays by name, never by number", () => {
    const { box } = setup({ trays: [A, B, C] });
    expect(screen.getByRole("button", { name: "Region deck, layer 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dice, layer 1" })).toBeTruthy();
    const tile = box.querySelector('[data-key="a:p0:0"]');
    expect(tile?.querySelector(".plan-label")).toBeNull();
    expect(tile?.querySelector(".plan-name")?.textContent).toBe("Region deck");
    expect(tile?.getAttribute("title")).toBe("Region deck");
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("aria-label") ?? "").not.toMatch(/\bTray \d|#\d/);
    }
    for (const t of Array.from(box.querySelectorAll(".plan-tile"))) {
      expect(t.textContent).not.toMatch(/^\d+$/);
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
    const { box } = setup({ trays, components: [deck, dice, second] });
    const fill = (key: string) =>
      (box.querySelector(`[data-key="${key}"]`)?.getAttribute("style") ?? "").match(
        /--tile-fill:\s*([^;]+)/,
      )?.[1];
    // The first deck is the kind's base hue; the second is a shade of it, not the dice's index.
    expect(fill("a:p0:0")).toContain(shadeHex("cards", 0, "light").fill);
    expect(fill("b:p0:0")).toBeTruthy();
    expect(fill("b:p0:0")).not.toBe(fill("a:p0:0"));
    expect(fill("b:p0:0")).toContain("light-dark(");
  });

  it("shows the kind icon only on the selected tray", () => {
    const { box, view, p } = setup();
    expect(box.querySelector(".plan-pill svg")).toBeNull();
    view.rerender(<Host {...p} selectedKey="a:p0:0" />);
    expect(box.querySelectorAll(".plan-pill svg")).toHaveLength(1);
    const glyph = box.querySelector('[data-key="a:p0:0"] .plan-pill svg');
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(glyph?.getAttribute("width")).toBe("13");
    expect(glyph?.querySelector("rect, path")).toBeTruthy();
    expect(box.querySelector('[data-key="b:p0:0"] .plan-pill svg')).toBeNull();
    view.rerender(<Host {...p} selectedKey="b:p0:0" />);
    expect(box.querySelector('[data-key="a:p0:0"] .plan-pill svg')).toBeNull();
    expect(box.querySelector('[data-key="b:p0:0"] .plan-pill svg')).toBeTruthy();
  });

  it("shows the kind icon on the tray with the keyboard focus", () => {
    const { box } = setup();
    // jsdom has no :focus-visible: say that the focus ring is showing.
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ":focus-visible" || matches.call(this, selector);
    });
    fireEvent.focus(screen.getByRole("button", { name: "Dice, layer 1" }));
    expect(box.querySelector('[data-key="b:p0:0"] .plan-pill svg')).toBeTruthy();
    expect(box.querySelector('[data-key="a:p0:0"] .plan-pill svg')).toBeNull();
  });

  it("shows the kind icon on the tray the pointer is on, and not for a touch", () => {
    const { box } = setup();
    const dice = screen.getByRole("button", { name: /^Dice/ });
    fireEvent.pointerEnter(dice, { pointerType: "touch" });
    expect(box.querySelector(".plan-pill svg")).toBeNull();
    fireEvent.pointerEnter(dice, { pointerType: "mouse" });
    expect(box.querySelector('[data-key="b:p0:0"] .plan-pill svg')).toBeTruthy();
    fireEvent.pointerLeave(dice, { pointerType: "mouse" });
    expect(box.querySelector(".plan-pill svg")).toBeNull();
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
    const { p, box } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(box, { ...centerA, pointerId: 1 });
    expect(p.onSelect).toHaveBeenCalledWith("a:p0:0");
    expect(p.onSwap).not.toHaveBeenCalled();
  });

  it("touch drag swaps; the box has touch-action none", () => {
    expect(planCss).toMatch(/\.plan-box\s*{[^}]*touch-action:\s*none/);
    const { p, box } = setup();
    // The stylesheet rule applies to the element PlanView renders.
    expect(box.getAttribute("class")).toContain("plan-box");
    const touch = { pointerId: 7, pointerType: "touch", button: 0 };
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      ...touch,
    });
    fireEvent.pointerMove(box, { ...at(100, 49.5), ...touch });
    fireEvent.pointerMove(box, { ...centerB, ...touch });
    expect(screen.getByRole("button", { name: /^Dice/ }).getAttribute("class")).toContain(
      "is-drop",
    );
    fireEvent.pointerUp(box, { ...centerB, ...touch });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("pointercancel resets the drag", () => {
    const { p, box } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerMove(box, { ...centerB, pointerId: 2 });
    fireEvent.pointerCancel(box, { pointerId: 2 });
    fireEvent.pointerUp(box, { ...centerB, pointerId: 2 });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Dice/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
  });

  it("a lost pointer capture ends the drag like a cancel", () => {
    const { p, box } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerMove(box, { ...centerB, pointerId: 2 });
    fireEvent.lostPointerCapture(box, { pointerId: 2 });
    fireEvent.pointerUp(box, { ...centerB, pointerId: 2 });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Dice/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
  });

  it("does not drag leftovers or drop onto them", () => {
    const { p, box } = setup({ trays: [A, B, L2] });
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Region deck/ }), {
      ...centerA,
      pointerId: 3,
      button: 0,
    });
    fireEvent.pointerMove(box, { ...centerL2, pointerId: 3 });
    expect(screen.getByRole("button", { name: /^Spare/ }).getAttribute("class")).not.toContain(
      "is-drop",
    );
    fireEvent.pointerUp(box, { ...centerL2, pointerId: 3 });
    expect(p.onSwap).not.toHaveBeenCalled();
    // A leftover can't start a drag either, but a tap still selects it.
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Spare/ }), {
      ...centerL2,
      pointerId: 4,
      button: 0,
    });
    fireEvent.pointerMove(box, { ...centerA, pointerId: 4 });
    expect(
      screen.getByRole("button", { name: /^Region deck/ }).getAttribute("class"),
    ).not.toContain("is-drop");
    expect(screen.getByRole("button", { name: /^Spare/ }).getAttribute("class")).not.toContain(
      "is-source",
    );
    fireEvent.pointerUp(box, { ...centerA, pointerId: 4 });
    expect(p.onSwap).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Spare/ }), {
      ...centerL2,
      pointerId: 5,
      button: 0,
    });
    fireEvent.pointerUp(box, { ...centerL2, pointerId: 5 });
    expect(p.onSelect).toHaveBeenCalledWith("leftover:1");
  });

  it("says next to the plan why a drag cannot swap", () => {
    const { p, box } = setup({ trays: [A, B, L2] });
    const a = screen.getByRole("button", { name: /^Region deck/ });
    // Over a leftover: refused, with a visible message.
    fireEvent.pointerDown(a, { ...centerA, pointerId: 1, button: 0 });
    fireEvent.pointerMove(box, { ...centerL2, pointerId: 1 });
    expect(screen.getByRole("status").textContent).toMatch(/can't be swapped with/);
    fireEvent.pointerUp(box, { ...centerL2, pointerId: 1 });
    expect(p.onSwap).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/can't be swapped with/);
    // Released over empty space: nothing happens, and it says so.
    fireEvent.pointerDown(a, { ...centerA, pointerId: 2, button: 0 });
    fireEvent.pointerMove(box, { ...at(95, 50), pointerId: 2 });
    fireEvent.pointerUp(box, { ...at(95, 50), pointerId: 2 });
    expect(screen.getByRole("status").textContent).toMatch(/Nothing was swapped/);
    // Dragging a leftover is refused with a message; a valid swap clears it.
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Spare/ }), {
      ...centerL2,
      pointerId: 3,
      button: 0,
    });
    fireEvent.pointerMove(box, { ...centerA, pointerId: 3 });
    expect(screen.getByRole("status").textContent).toMatch(/can't be dragged/);
    fireEvent.pointerUp(box, { ...centerA, pointerId: 3 });
    fireEvent.pointerDown(a, { ...centerA, pointerId: 4, button: 0 });
    fireEvent.pointerMove(box, { ...centerB, pointerId: 4 });
    fireEvent.pointerUp(box, { ...centerB, pointerId: 4 });
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
    const { p, box } = setup();
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
    fireEvent.pointerUp(box, { ...centerB, pointerId: 2 });
    expect(p.onSelect).not.toHaveBeenCalled();
    fireEvent.pointerMove(box, { ...centerB, pointerId: 1 });
    fireEvent.pointerCancel(box, { pointerId: 3 });
    expect(screen.getByRole("button", { name: /^Dice/ }).getAttribute("class")).toContain(
      "is-drop",
    );
    fireEvent.pointerUp(box, { ...centerB, pointerId: 1 });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("recovers when a pointerup never came: the same pointer pressing again starts afresh", () => {
    const { p, box } = setup();
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
    fireEvent.pointerUp(box, { ...centerB, pointerId: 1 });
    expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
    expect(p.onSwap).not.toHaveBeenCalled();
  });

  it("swaps with the keyboard: select, start a swap from the tray bar, Enter on the other tray", () => {
    const { p } = setup({ selectedKey: "a:p0:0", swapFrom: "a:p0:0" });
    expect(screen.getByRole("status").textContent).toMatch(/Choose the tray to swap with/);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Dice/ }), { key: "Enter" });
    expect(p.onSwap).toHaveBeenCalledWith("a:p0:0", "b:p0:0");
  });

  it("badges a pinned tray", () => {
    const { p, view } = setup();
    expect(screen.queryByRole("img", { name: "Pinned" })).toBeNull();
    view.rerender(<Host {...p} lockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Region deck, layer 1, pinned" })).toBeTruthy();
    const badge = screen.getByRole("img", { name: "Pinned" });
    expect(badge.closest('[data-key="a:p0:0"]')).not.toBeNull();
    // a pin that is not turned has no tag
    expect(screen.queryByText("Turned")).toBeNull();
  });

  it("tags a turned pin", () => {
    const turned = makeTray({ ...A, rotated: true });
    const { p, view } = setup({ trays: [turned, B], lockedKeys: new Set(["a:p0:0"]) });
    expect(screen.getByRole("img", { name: "Pinned" })).toBeTruthy();
    expect(screen.getByText("Turned")).toBeTruthy();
    // a tray turned by the plan, not pinned, carries no tag: the tag belongs to the pin
    view.rerender(<Host {...p} lockedKeys={new Set<string>()} />);
    expect(screen.queryByText("Turned")).toBeNull();
  });

  it("says size locked in the name of a tray, and prints nothing more on the tile", () => {
    const { p, view } = setup();
    view.rerender(<Host {...p} sizeLockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByRole("button", { name: "Region deck, layer 1, size locked" })).toBeTruthy();
    expect(screen.queryByText("size locked")).toBeNull();
  });

  it("dims the other trays while one is selected, and none when nothing is", () => {
    const { box, view, p } = setup();
    expect(box.querySelectorAll(".is-dimmed")).toHaveLength(0);
    view.rerender(<Host {...p} selectedKey="a:p0:0" />);
    const dimmed = Array.from(box.querySelectorAll(".plan-tile.is-dimmed")).map((t) =>
      t.getAttribute("data-key"),
    );
    expect(dimmed).toEqual(["b:p0:0"]);
    expect(box.querySelector('[data-key="a:p0:0"]')?.getAttribute("class")).toContain(
      "is-selected",
    );
  });

  it("lights the trays of the component the rail is pointing at, and dims the rest", () => {
    const { box } = setup();
    act(() => {
      hoveredComponent.value = deck.id;
    });
    expect(box.querySelector('[data-key="a:p0:0"]')?.getAttribute("class")).not.toContain(
      "is-dimmed",
    );
    expect(box.querySelector('[data-key="b:p0:0"]')?.getAttribute("class")).toContain("is-dimmed");
    expect(box.querySelector('[data-key="a:p0:0"] .plan-pill svg')).toBeTruthy();
    act(() => {
      hoveredComponent.value = null;
    });
    expect(box.querySelectorAll(".is-dimmed")).toHaveLength(0);
  });

  it("points the rail at the component of the tray the pointer is on", () => {
    setup();
    fireEvent.pointerEnter(screen.getByRole("button", { name: /^Dice/ }), {
      pointerType: "mouse",
    });
    expect(hoveredComponent.value).toBe(dice.id);
    fireEvent.pointerLeave(screen.getByRole("button", { name: /^Dice/ }), {
      pointerType: "mouse",
    });
    expect(hoveredComponent.value).toBeNull();
  });

  it("dims every tray that is not pinned while a search runs", () => {
    const { box } = setup({ searching: true, lockedKeys: new Set(["a:p0:0"]) });
    expect(box.querySelector('[data-key="a:p0:0"]')?.getAttribute("class")).not.toContain(
      "is-dimmed",
    );
    expect(box.querySelector('[data-key="b:p0:0"]')?.getAttribute("class")).toContain("is-dimmed");
  });

  it("shows the layer the app asks for (the stage's Layer switch owns the choice)", () => {
    setup();
    expect(screen.getAllByRole("button", { name: /layer 1/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /layer 2/ })).toBeNull();
    expect(document.querySelector(".layer-picker")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("shows layer 2 when the app's level is 1", () => {
    setup({ level: 1 });
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

  it("shows the name on a tile, and no size", () => {
    const { box } = setup();
    const tile = box.querySelector('[data-key="a:p0:0"]');
    expect(tile?.querySelector(".plan-name")?.textContent).toBe("Region deck");
    expect(tile?.textContent).not.toMatch(/90 × 99/);
    // the pill is for the eye: the tile's own name speaks for it
    expect(tile?.querySelector(".plan-center")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps name pills on one line", () => {
    const name = "The very long name of a card deck here 40";
    expect(name).toHaveLength(41);
    const longName = { ...newComponent("cards"), name };
    const long = makeTray({ ...A, w: 99, compartments: [holding(name)] });
    const tiny = makeTray({ ...B, w: 8, d: 8 });
    const { box } = setup({ trays: [long, tiny], components: [longName, dice] });
    // the pill holds the whole name and the CSS cuts it: one line, an ellipsis, the name in the title
    expect(box.querySelector('[data-key="a:p0:0"] .plan-name')?.textContent).toBe(name);
    expect(box.querySelector('[data-key="a:p0:0"]')?.getAttribute("title")).toBe(name);
    expect(screen.getByRole("button", { name: `${name}, layer 1` })).toBeTruthy();
    expect(planCss).toMatch(/\.plan-pill\s*{[^}]*white-space:\s*nowrap/);
    expect(planCss).toMatch(/\.plan-pill\s*{[^}]*max-width:\s*100%/);
    expect(planCss).toMatch(/\.plan-name\s*{[^}]*overflow:\s*hidden/);
    expect(planCss).toMatch(/\.plan-name\s*{[^}]*text-overflow:\s*ellipsis/);
    // a tile too small for a pill has none; its name is still its title
    expect(box.querySelector('[data-key="b:p0:0"] .plan-pill')).toBeNull();
    expect(screen.getByRole("button", { name: "Dice, layer 1" })).toBeTruthy();
  });

  it("centres the pill in the tile, the icon and the name side by side", () => {
    const { box } = setup({ selectedKey: "a:p0:0" });
    const pill = box.querySelector('[data-key="a:p0:0"] .plan-pill');
    expect(pill?.parentElement?.getAttribute("class")).toContain("plan-center");
    expect(Array.from(pill?.children ?? []).map((c) => c.localName)).toEqual(["svg", "span"]);
  });

  it("draws a cell per compartment", () => {
    const four = [0, 1, 2, 3].map((i) => ({
      ...holding("Region deck ×50"),
      x: 1.6 + (i % 2) * 45,
      y: 1.6 + Math.floor(i / 2) * 48,
      w: 43,
      d: 46,
    }));
    const starter = makeTray({ ...A, compartments: four });
    const { box } = setup({ trays: [starter, B] });
    expect(box.querySelectorAll('[data-key="a:p0:0"] .plan-cell')).toHaveLength(4);
    expect(box.querySelectorAll('[data-key="b:p0:0"] .plan-cell')).toHaveLength(1);
  });

  it("draws each compartment where it is", () => {
    // 90 wide, 99 deep: the first well is the left half, the second the right half of the lower part
    const tray = makeTray({
      ...A,
      compartments: [
        { ...holding("Region deck ×50"), x: 0, y: 49.5, w: 45, d: 49.5 },
        { ...holding("Region deck ×50"), x: 45, y: 0, w: 22.5, d: 24.75 },
      ],
    });
    const { box } = setup({ trays: [tray] });
    const cells = Array.from(box.querySelectorAll<HTMLElement>('[data-key="a:p0:0"] .plan-cell'));
    // x from the left; y from the front, so the front (y 0) is the bottom of the tile
    expect(cells[0]?.style.left).toBe("0%");
    expect(cells[0]?.style.width).toBe("50%");
    expect(cells[0]?.style.top).toBe("0%");
    expect(cells[0]?.style.height).toBe("50%");
    expect(cells[1]?.style.left).toBe("50%");
    expect(cells[1]?.style.width).toBe("25%");
    expect(cells[1]?.style.top).toBe("75%");
    expect(cells[1]?.style.height).toBe("25%");
    // the cells sit in the tile's padding box, 8 px in: the tile's own box is not theirs
    expect(cells[0]?.parentElement?.getAttribute("class")).toContain("plan-cells");
  });

  it("draws no cells in a spare tray, and no icon", () => {
    const { box } = setup({
      trays: [A, B, { ...L2, w: 60, d: 40 }],
      selectedKey: "leftover:1",
    });
    const spare = box.querySelector('[data-key="leftover:1"]');
    expect(spare?.getAttribute("class")).toContain("is-leftover");
    expect(spare?.querySelectorAll(".plan-cell")).toHaveLength(0);
    expect(spare?.querySelector(".plan-pill svg")).toBeNull();
    expect(spare?.querySelector(".plan-name")?.textContent).toMatch(/^Spare/);
  });

  it("draws a spacer hatched with a dashed edge", () => {
    expect(planCss).toMatch(
      /\.plan-tile\.is-leftover\s*{[^}]*repeating-linear-gradient\(\s*135deg,\s*var\(--spacer-fill\) 0 6px,\s*var\(--spacer-hatch\) 6px 12px/,
    );
    expect(planCss).toMatch(/\.plan-tile\.is-leftover\s*{[^}]*2px dashed var\(--spacer-dash\)/);
    expect(planCss).toMatch(/\.plan-tile\.is-leftover \.plan-pill\s*{[^}]*--muted-strong/);
  });

  it("positions a tile from its footprint in the box, and the box from its measures", () => {
    const { box } = setup({ trays: [B] });
    const tile = box.querySelector<HTMLElement>('[data-key="b:p0:0"]');
    // B stands at x 100, y 0, 99 by 99, in a 200 by 100 box with 0.5 mm clearance
    expect(frame.bc).toBe(0.5);
    expect(tile?.style.getPropertyValue("--x")).toBe("50.25%");
    expect(tile?.style.getPropertyValue("--y")).toBe("0.5%");
    expect(tile?.style.getPropertyValue("--w")).toBe("49.5%");
    expect(tile?.style.getPropertyValue("--d")).toBe("99%");
    const fit = box.closest<HTMLElement>(".plan-fit");
    expect(fit?.style.getPropertyValue("--box-w")).toBe("200");
    expect(fit?.style.getPropertyValue("--box-l")).toBe("100");
  });

  it("prints no legend paragraph under the plan, spare tray or not (the boards show none)", () => {
    setup({ trays: [A, B, { ...L2, w: 60, d: 40 }] });
    expect(screen.queryByText(/Hatched trays are spares/)).toBeNull();
    expect(document.querySelector(".plan-legend")).toBeNull();
  });

  it("prints no hint paragraph under the plan", () => {
    setup();
    expect(screen.queryByText(/Select a tray to see its details/)).toBeNull();
    expect(document.querySelector(".plan .hint")).toBeNull();
  });

  it("draws a plan that is out of date as it is: the banner says so, as Main's does", () => {
    const { box, view, p } = setup();
    view.rerender(<Host {...p} stale />);
    expect(box.getAttribute("class")).not.toMatch(/stale/);
    expect(planCss).not.toMatch(/grayscale/);
  });

  it("shows the tray bar it is given in the slot above the box", () => {
    const { box } = setup({ selectedKey: "a:p0:0", bar: <p>The tray bar</p> });
    const bar = screen.getByText("The tray bar");
    expect(bar.closest(".stage-slot")).not.toBeNull();
    expect(box.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.queryByText("Tap a tray for details.")).toBeNull();
  });

  it("asks for a tap in the slot while no tray is selected", () => {
    const { p, view } = setup();
    expect(screen.getByText("Tap a tray for details.").closest(".stage-slot")).not.toBeNull();
    view.rerender(<Host {...p} selectedKey="a:p0:0" bar={<p>The tray bar</p>} />);
    expect(screen.queryByText("Tap a tray for details.")).toBeNull();
  });

  it("rings the selected tray on the tile, with the ring over its neighbours", () => {
    const { box } = setup({ selectedKey: "a:p0:0" });
    const tile = box.querySelector('[data-key="a:p0:0"]');
    expect(tile?.getAttribute("class")).toContain("is-selected");
    expect(tile?.getAttribute("aria-pressed")).toBe("true");
    expect(box.querySelector('[data-key="b:p0:0"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(planCss).toMatch(
      /\.plan-tile\.is-selected\s*{[^}]*box-shadow:\s*var\(--ring-selected\)/,
    );
  });

  it("marks the plan's box for the screenshots", () => {
    const { box } = setup();
    expect(box.getAttribute("data-region")).toBe("plan-box");
  });

  it("captions the box with its layer and its front", () => {
    setup({ trays: [A, B, C] });
    const caption = screen.getByText("Layer 1 (bottom), seen from above. Front of the box");
    expect(caption.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    cleanup();
    setup({ trays: [A, B, C], level: 1 });
    expect(screen.getByText("Layer 2 (top), seen from above. Front of the box")).toBeTruthy();
    cleanup();
    setup({ trays: [A, B] });
    expect(screen.getByText("Layer 1, seen from above. Front of the box")).toBeTruthy();
  });

  it("captions a phone's box with its front only, and drops the slot's hint", () => {
    phone();
    setup({ trays: [A, B, C] });
    expect(screen.getByText("Front of the box")).toBeTruthy();
    expect(screen.queryByText(/seen from above/)).toBeNull();
    // the slot is there for the live region, but it takes no room while it has nothing to say
    expect(document.querySelector(".stage-slot")?.getAttribute("class")).toContain(
      "visually-hidden",
    );
  });

  it("says the gaps are filled again while a pin exists, and not otherwise", () => {
    const { p, view } = setup();
    const line = "Spacers fill the gaps again when the plan updates.";
    expect(screen.queryByText(line)).toBeNull();
    view.rerender(<Host {...p} lockedKeys={new Set(["a:p0:0"])} />);
    expect(screen.getByText(line)).toBeTruthy();
  });
});

describe("a merged filler on the plan", () => {
  it("is one tile per member on the layer it stands on, all with one key", () => {
    const { view } = setup({ trays: [A, B, C, M] });
    const merged = view.container.querySelectorAll('[data-key="merged:0"]');
    // one tile with the name and the role, drawn as the members of the layer (layer 1: the ground filler)
    expect(merged).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-of="merged:0"]')).toHaveLength(0);
    expect(merged[0]?.getAttribute("title")).toMatch(/^Spare/);
    expect(merged[0]?.classList.contains("is-leftover")).toBe(true);
  });

  it("draws a merged part's other members as plain parts of the same tile", () => {
    const two = makeTray({
      ...M,
      merged: {
        members: [
          { ...L2, x: 91, y: 0, w: 8, d: 30 },
          { ...L2, key: "leftover:2", x: 91, y: 60, w: 8, d: 39 },
        ],
        bridges: [],
        flipped: false,
      },
    });
    const { view } = setup({ trays: [A, B, two], selectedKey: "merged:0" });
    const parts = view.container.querySelectorAll('[data-of="merged:0"]');
    expect(parts).toHaveLength(1);
    expect(parts[0]?.getAttribute("role")).toBeNull();
    expect(parts[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(parts[0]?.getAttribute("class")).toContain("is-selected");
  });

  it("shows its other member on the next layer, and is selected from either", () => {
    const onSelect = vi.fn();
    const { view } = setup({ trays: [A, B, C, M], onSelect, level: 1 });
    const merged = view.container.querySelector('[data-key="merged:0"]');
    expect(merged).not.toBeNull();
    fireEvent.keyDown(merged as Element, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("merged:0");
  });

  it("selects a merged part by tapping any of its members", () => {
    const two = makeTray({
      ...M,
      merged: {
        members: [
          { ...L2, x: 91, y: 0, w: 8, d: 30 },
          { ...L2, key: "leftover:2", x: 91, y: 60, w: 8, d: 39 },
        ],
        bridges: [],
        flipped: false,
      },
    });
    const onSelect = vi.fn();
    const { view, box } = setup({ trays: [A, B, two], onSelect });
    const part = view.container.querySelector('[data-of="merged:0"]') as Element;
    fireEvent.pointerDown(part, { ...at(95, 20), pointerId: 1, button: 0 });
    fireEvent.pointerUp(box, { ...at(95, 20), pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith("merged:0");
  });
});
