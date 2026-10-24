// src/ui/components/ComponentList.drag.test.tsx
// @vitest-environment jsdom
// Dragging in the rail's list (0.7.0 Task 14, spec §7.3): grips, the 4 px start, the lifted row, the
// drop line, Escape, and what a drop calls. jsdom draws no layout, so each element's rectangle is set.
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { Component, ComponentKind, Group } from "../../model/types";
import { ComponentList } from "./ComponentList";

afterEach(cleanup);

const named = (kind: ComponentKind, id: string, name: string): Component => ({
  ...newComponent(kind),
  id,
  name,
});

const items = [
  named("cards", "m", "Market deck"),
  named("cards", "s", "Starter deck"),
  named("bulk", "r", "Resources"),
  named("minis", "h", "Hero"),
  named("tiles", "t", "Hex tiles"),
];
const kit: Group = {
  id: "g",
  name: "Player kit",
  copies: 4,
  access: "often",
  memberIds: ["s", "r", "h"],
};
const empty: Group = { id: "e", name: "Spare", access: "sometimes", memberIds: [] };

const box = (top: number, bottom: number, left = 0, right = 300) => ({
  top,
  bottom,
  left,
  right,
  width: right - left,
  height: bottom - top,
  x: left,
  y: top,
  toJSON: () => ({}),
});
const at = (el: Element | null, top: number, bottom: number): void => {
  (el as HTMLElement).getBoundingClientRect = () => box(top, bottom);
};

/**
 * The list 0..640: Market deck 0..50; the kit card 54..244 (header 54..100, members 104..240: Starter
 * deck 104..148, Resources 150..194, Hero 196..240); Spare, an empty card, 248..340 (dashed area
 * 290..336); Hex tiles 344..394. Below 394 the list is empty ground.
 */
function drawList(container: Element) {
  const list = container.querySelector(".rail-list");
  at(list, 0, 640);
  (list as HTMLElement).scrollTop = 0;
  const cards = container.querySelectorAll(".gc");
  at(cards[0] ?? null, 54, 244);
  at(container.querySelector(".gc-members"), 104, 240);
  at(container.querySelector('[data-member-id="s"]'), 104, 148);
  at(container.querySelector('[data-member-id="r"]'), 150, 194);
  at(container.querySelector('[data-member-id="h"]'), 196, 240);
  at(cards[1] ?? null, 248, 340);
  at(container.querySelector(".gc-empty"), 290, 336);
  // the list's own entries: the items' rows and the group cards, as the drop reads their places
  at(container.querySelector('[data-entry="m"]'), 0, 50);
  at(container.querySelector('[data-entry="g"]'), 54, 244);
  at(container.querySelector('[data-entry="e"]'), 248, 340);
  at(container.querySelector('[data-entry="t"]'), 344, 394);
  return list as HTMLElement;
}

const grip = (container: Element, id: string): HTMLElement =>
  container.querySelector(`[data-grip="${id}"]`) as HTMLElement;

const down = (el: Element, x: number, y: number) =>
  fireEvent.pointerDown(el, { clientX: x, clientY: y, button: 0, pointerId: 1 });
const move = (x: number, y: number) =>
  fireEvent.pointerMove(document.body, { clientX: x, clientY: y, pointerId: 1 });
const up = (x: number, y: number) =>
  fireEvent.pointerUp(document.body, { clientX: x, clientY: y, pointerId: 1 });

function setup(props: { compact?: boolean; groups?: Group[] } = {}) {
  const onDrop = vi.fn();
  const onOpen = vi.fn();
  const { container } = render(
    <ComponentList
      components={items}
      groups={props.groups ?? [kit, empty]}
      compact={props.compact}
      onOpen={onOpen}
      onDrop={onDrop}
    />,
  );
  return { container, onDrop, onOpen, list: drawList(container) };
}

describe("the grips", () => {
  it("are on each member and on each ungrouped row, hidden from assistive technology and not tab stops", () => {
    const { container } = setup();
    for (const id of ["m", "s", "r", "h", "t"]) {
      const g = grip(container, id);
      expect(g, id).toBeTruthy();
      expect(g.getAttribute("aria-hidden")).toBe("true");
      expect(g.hasAttribute("tabindex")).toBe(false);
    }
    // an ungrouped row's grip is the hover one; a member's is always there
    expect(grip(container, "m").classList.contains("gc-grip--loose")).toBe(true);
    expect(grip(container, "s").classList.contains("gc-grip--loose")).toBe(false);
  });

  it("are shown all the time where there is no hover (a tablet): the list says so", () => {
    expect(setup().list.hasAttribute("data-no-hover")).toBe(false);
    cleanup();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(hover: none)", media: q }));
    expect(setup().list.getAttribute("data-no-hover")).toBe("true");
    vi.unstubAllGlobals();
  });

  it("are not drawn in the phone's sheet list", () => {
    const { container } = setup({ compact: true });
    expect(container.querySelectorAll(".gc-grip")).toHaveLength(0);
  });
});

describe("a drag", () => {
  it("does not begin at 3 px of movement, and a drop then does nothing", () => {
    const { container, onDrop, list } = setup();
    down(grip(container, "m"), 20, 25);
    move(23, 25);
    expect(list.classList.contains("is-dragging")).toBe(false);
    expect(container.querySelector(".is-drag-lifted")).toBeNull();
    up(23, 25);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("begins at 4 px: the row lifts, follows the pointer, and the list is a drag", () => {
    const { container, list } = setup();
    down(grip(container, "m"), 20, 25);
    move(24, 25);
    const row = grip(container, "m").closest("li") as HTMLElement;
    expect(row.classList.contains("is-drag-lifted")).toBe(true);
    expect(list.classList.contains("is-dragging")).toBe(true);
    move(40, 125);
    // held 6 px below its top edge by the pointer (its rectangle is at 0 here)
    expect(row.style.transform).toBe("translateY(119px)");
  });

  it("drops an ungrouped item between two members: into the group, at that place", () => {
    const { container, onDrop } = setup();
    down(grip(container, "m"), 20, 25);
    move(100, 149);
    // the group being entered is washed, and a line marks the place between the two rows
    const card = container.querySelectorAll(".gc")[0] as HTMLElement;
    expect(card.getAttribute("data-drop")).toBe("true");
    const line = container.querySelector(".rail-dropline") as HTMLElement;
    expect(line.hidden).toBe(false);
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(line.style.top).toBe("148px");
    up(100, 149);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith("m", { groupId: "g", index: 1 });
    // nothing is left behind
    expect(container.querySelector(".is-drag-lifted")).toBeNull();
    expect(container.querySelector("[data-drop]")).toBeNull();
    expect(container.querySelector(".rail-dropline")).toBeNull();
  });

  it("drops on an empty group's dashed area: into it, first", () => {
    const { container, onDrop } = setup();
    down(grip(container, "m"), 20, 25);
    move(100, 310);
    up(100, 310);
    expect(onDrop).toHaveBeenCalledWith("m", { groupId: "e", index: 0 });
  });

  it("takes a member out when it is dropped anywhere else in the list", () => {
    const { container, onDrop } = setup();
    down(grip(container, "r"), 20, 170);
    move(100, 500);
    // out has no line and no group is washed
    expect(container.querySelector("[data-drop]")).toBeNull();
    up(100, 500);
    // after the last entry of the list: out of the group, at the end of the list
    expect(onDrop).toHaveBeenCalledWith("r", { out: true, index: 4 });
  });

  it("orders a member within its group (no wash on a group it is already in)", () => {
    const { container, onDrop } = setup();
    down(grip(container, "s"), 20, 125);
    move(100, 230);
    expect(container.querySelector("[data-drop]")).toBeNull();
    up(100, 230);
    expect(onDrop).toHaveBeenCalledWith("s", { groupId: "g", index: 2 });
  });

  it("does nothing for a member put back where it was", () => {
    const { container, onDrop } = setup();
    down(grip(container, "r"), 20, 170);
    move(100, 172);
    up(100, 172);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("does nothing for an ungrouped item dropped on the place it has", () => {
    const { container, onDrop } = setup();
    down(grip(container, "m"), 20, 25);
    move(100, 30);
    up(100, 30);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("places an ungrouped item at another place in the list: among the other entries, by index", () => {
    const { container, onDrop } = setup();
    down(grip(container, "m"), 20, 25);
    move(100, 370);
    up(100, 370);
    expect(onDrop).toHaveBeenCalledWith("m", { out: true, index: 3 });
  });

  it("cancels a drop outside the list", () => {
    const { container, onDrop } = setup();
    down(grip(container, "m"), 20, 25);
    move(100, 149);
    move(600, 149);
    up(600, 149);
    expect(onDrop).not.toHaveBeenCalled();
    expect(container.querySelector(".is-drag-lifted")).toBeNull();
  });

  it("is cancelled by Escape: the row is back, nothing is called, and the later release does nothing", () => {
    const { container, onDrop, list } = setup();
    down(grip(container, "m"), 20, 25);
    move(100, 149);
    const row = grip(container, "m").closest("li") as HTMLElement;
    expect(row.style.transform).not.toBe("");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(row.style.transform).toBe("");
    expect(row.classList.contains("is-drag-lifted")).toBe(false);
    expect(list.classList.contains("is-dragging")).toBe(false);
    expect(container.querySelector("[data-drop]")).toBeNull();
    up(100, 149);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("lets no menu open in the middle of a drag, and none is held back once it is over", () => {
    const { container } = setup();
    down(grip(container, "m"), 20, 25);
    move(100, 149);
    const during = new Event("contextmenu", { cancelable: true });
    document.body.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    const after = new Event("contextmenu", { cancelable: true });
    document.body.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("opens the row on a plain click, and a press on the grip that does not move opens nothing and drops nothing", () => {
    const { container, onDrop, onOpen } = setup();
    fireEvent.click(container.querySelector('[data-row-id="m"]') as Element);
    expect(onOpen).toHaveBeenCalledWith("m");
    onOpen.mockClear();
    down(grip(container, "m"), 20, 25);
    up(20, 25);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("starts only from a grip: a press on a row, or a second press while one goes on, begins nothing", () => {
    const { container, onDrop } = setup();
    const row = container.querySelector('[data-row-id="m"]') as HTMLElement;
    down(row, 20, 25);
    move(100, 149);
    expect(container.querySelector(".is-drag-lifted")).toBeNull();
    up(100, 149);
    expect(onDrop).not.toHaveBeenCalled();
    // the secondary button does not drag
    fireEvent.pointerDown(grip(container, "m"), {
      clientX: 20,
      clientY: 25,
      button: 2,
      pointerId: 1,
    });
    move(100, 149);
    expect(container.querySelector(".is-drag-lifted")).toBeNull();
  });

  it("is off in the phone's sheet", () => {
    const { container, onDrop } = setup({ compact: true });
    const row = container.querySelector("li") as HTMLElement;
    down(row, 20, 25);
    move(100, 149);
    up(100, 149);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("scrolls the list a step per move near its edge under reduced motion, with no frames", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container, list } = setup();
    Object.defineProperty(list, "scrollHeight", { value: 2000, configurable: true });
    down(grip(container, "m"), 20, 25);
    move(100, 400);
    move(100, 625);
    expect(list.scrollTop).toBeGreaterThan(0);
    expect(raf).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    vi.unstubAllGlobals();
    raf.mockRestore();
  });
});
