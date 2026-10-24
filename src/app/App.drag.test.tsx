// src/app/App.drag.test.tsx
// @vitest-environment jsdom
// Dragging in the rail, on the whole app (0.7.0 Task 14, spec §7.3, §7.9): each drop is one undo step
// through the pure actions, said aloud by names in the rail's live region, with its note in the
// stage's toast; a cancelled or empty drop is no step. jsdom has no layout, so the list's
// rectangles are set by hand.
import { act, cleanup, fireEvent, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hoveredComponent, hoveredMembers } from "../screens/hover";
import { loadSeed } from "../test-support/harbourKings";
import type { Project } from "../model/types";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  hoveredComponent.value = null;
  hoveredMembers.value = null;
});

const kit = (): Project => loadSeed("harbour-kings-kit").project;
const idOf = (p: Project, name: string): string =>
  p.components.find((c) => c.name === name)?.id ?? "?";

const box = (top: number, bottom: number) => ({
  top,
  bottom,
  left: 0,
  right: 300,
  width: 300,
  height: bottom - top,
  x: 0,
  y: top,
  toJSON: () => ({}),
});
const at = (el: Element | null, top: number, bottom: number): void => {
  (el as HTMLElement).getBoundingClientRect = () => box(top, bottom);
};

/**
 * The list 0..600: the Player kit card 0..200 (members Starter deck 50..90, Resources 92..132, Hero
 * 134..174), then Market deck 206..250 and Hex tiles 254..300. Ground below 300 is the list's too.
 */
function drawRail(p: Project): HTMLElement {
  const rail = screen.getByRole("complementary", { name: "What's inside" });
  const list = rail.querySelector(".rail-list") as HTMLElement;
  at(list, 0, 600);
  at(rail.querySelector(".gc"), 0, 200);
  at(rail.querySelector(".gc-members"), 50, 174);
  at(rail.querySelector(`[data-member-id="${idOf(p, "Starter deck")}"]`), 50, 90);
  at(rail.querySelector(`[data-member-id="${idOf(p, "Resources")}"]`), 92, 132);
  at(rail.querySelector(`[data-member-id="${idOf(p, "Hero")}"]`), 134, 174);
  // the list's entries, as a drop among them reads their places
  const group = p.groups?.[0]?.id ?? "?";
  at(rail.querySelector(`:scope .rail-list > li[data-entry="${group}"]`), 0, 200);
  at(rail.querySelector(`[data-entry="${idOf(p, "Market deck")}"]`), 206, 250);
  at(rail.querySelector(`[data-entry="${idOf(p, "Hex tiles")}"]`), 254, 300);
  return rail;
}

const drag = (p: Project, name: string, to: { x: number; y: number }, from = { x: 20, y: 10 }) => {
  const rail = drawRail(p);
  const grip = rail.querySelector(`[data-grip="${idOf(p, name)}"]`) as HTMLElement;
  fireEvent.pointerDown(grip, { clientX: from.x, clientY: from.y, button: 0, pointerId: 1 });
  fireEvent.pointerMove(document.body, {
    clientX: from.x + 10,
    clientY: from.y + 10,
    pointerId: 1,
  });
  fireEvent.pointerMove(document.body, { clientX: to.x, clientY: to.y, pointerId: 1 });
  return {
    release: () =>
      fireEvent.pointerUp(document.body, { clientX: to.x, clientY: to.y, pointerId: 1 }),
  };
};
const said = (): string => document.querySelector('[data-live="rail"]')?.textContent ?? "";
const members = (store: { state: { project: { value: Project } } }): string[] =>
  store.state.project.value.groups?.[0]?.memberIds ?? [];

describe("a drop in the rail", () => {
  it("puts an ungrouped item in a group at the place, as one undo step, said by names", () => {
    const p = kit();
    const { store } = renderApp({ project: p });
    expect(store.canUndo.peek()).toBe(false);
    act(() => {
      drag(p, "Market deck", { x: 100, y: 91 }).release();
    });
    expect(members(store)).toEqual([
      idOf(p, "Starter deck"),
      idOf(p, "Market deck"),
      idOf(p, "Resources"),
      idOf(p, "Hero"),
    ]);
    expect(said()).toContain("Market deck moved to Player kit.");
    // the copies it now has are said as well, and shown with Undo move in the stage's slot
    expect(said()).toContain("Market deck now has the group's 4 copies.");
    expect(screen.getByRole("button", { name: "Undo move" })).toBeTruthy();
    expect(document.querySelector(".removed-toast")?.textContent).toContain(
      "Market deck now has the group's 4 copies.",
    );
    // one undo step puts it all back
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(members(store)).toEqual([
      idOf(p, "Starter deck"),
      idOf(p, "Resources"),
      idOf(p, "Hero"),
    ]);
    expect(store.canUndo.peek()).toBe(false);
  });

  it("takes a member out when it is dropped on the list: it keeps the group's copies, and says so", () => {
    const p = kit();
    const { store } = renderApp({ project: p });
    act(() => {
      drag(p, "Hero", { x: 100, y: 450 }, { x: 20, y: 150 }).release();
    });
    expect(members(store)).toEqual([idOf(p, "Starter deck"), idOf(p, "Resources")]);
    expect(said()).toBe("Hero is out of Player kit.");
    expect(store.state.project.value.components.find((c) => c.name === "Hero")?.copies).toBe(4);
    expect(screen.getByRole("button", { name: "Undo move" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(members(store)).toHaveLength(3);
    expect(store.canUndo.peek()).toBe(false);
  });

  it("orders a member within its group, and says where it went by names", () => {
    const p = kit();
    const { store } = renderApp({ project: p });
    act(() => {
      drag(p, "Hero", { x: 100, y: 91 }, { x: 20, y: 150 }).release();
    });
    expect(members(store)).toEqual([
      idOf(p, "Starter deck"),
      idOf(p, "Hero"),
      idOf(p, "Resources"),
    ]);
    expect(said()).toBe("Hero is now after Starter deck.");
    act(() => {
      drag(p, "Hero", { x: 100, y: 55 }, { x: 20, y: 110 }).release();
    });
    expect(members(store)[0]).toBe(idOf(p, "Hero"));
    expect(said()).toBe("Hero is now first.");
    // each drop was a step of its own
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(members(store)[1]).toBe(idOf(p, "Hero"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.canUndo.peek()).toBe(false);
  });

  it("changes nothing, and makes no undo step, for a cancelled drag, a drop outside the list and an item left on its own place in the list", () => {
    const p = kit();
    const { store } = renderApp({ project: p });
    // Escape in the middle
    drag(p, "Market deck", { x: 100, y: 91 });
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.pointerUp(document.body, { clientX: 100, clientY: 91, pointerId: 1 });
    // outside the list
    act(() => {
      drag(p, "Market deck", { x: 900, y: 91 }).release();
    });
    // on the place it has among the list's entries
    act(() => {
      drag(p, "Market deck", { x: 100, y: 225 }, { x: 20, y: 230 }).release();
    });
    expect(members(store)).toHaveLength(3);
    expect(store.canUndo.peek()).toBe(false);
    expect(said()).toBe("");
  });

  it("does not move the rail's width, and the resize handle is not a grip", () => {
    const p = kit();
    renderApp({ project: p });
    const handle = screen.queryByRole("separator", { name: "Resize the list" });
    expect(handle).not.toBeNull();
    const before = handle?.getAttribute("aria-valuenow");
    const rail = drawRail(p);
    act(() => {
      drag(p, "Market deck", { x: 100, y: 91 }).release();
    });
    expect(handle?.getAttribute("aria-valuenow")).toBe(before);
    // a press and a move on the handle begin no drag
    if (handle !== null) {
      // jsdom has no pointer capture: the handle's own press is stubbed
      Object.assign(handle, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
      fireEvent.pointerDown(handle, { clientX: 300, clientY: 100, button: 0, pointerId: 1 });
      fireEvent.pointerMove(document.body, { clientX: 340, clientY: 100, pointerId: 1 });
      expect(rail.querySelector(".is-drag-lifted")).toBeNull();
      fireEvent.pointerUp(document.body, { clientX: 340, clientY: 100, pointerId: 1 });
    }
  });
});
