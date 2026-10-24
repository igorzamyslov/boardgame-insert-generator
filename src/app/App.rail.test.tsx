// src/app/App.rail.test.tsx
// @vitest-environment jsdom
// The rail's list as a place to choose and to arrange: a press on a row selects its tray and opens
// nothing; the pencil (or a double press) opens the editor; every way out of an editor; and the
// list's own order (`Project.listOrder`) set by a drag on a grip or Alt+↑/↓ on a row, as one undo
// step that touches neither the components nor the plan. jsdom has no layout: rectangles are set by hand.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../model/defaults";
import { inputsHash } from "../model/hash";
import { noForeign, parseProject, serializeProject } from "../model/schema";
import type { Component, Project } from "../model/types";
import { hoveredComponent, hoveredMembers } from "../screens/hover";
import { fixtureProject, makeLayout, makeTray } from "./test-helpers";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  hoveredComponent.value = null;
  hoveredMembers.value = null;
});

const item = (id: string, name: string): Component => ({ ...newComponent("cards"), id, name });
const well = (componentId: string, contents: string) => ({
  x: 1.6,
  y: 1.6,
  w: 40,
  d: 40,
  floorZ: 1.2,
  kind: "well" as const,
  contents,
  componentId,
  features: [],
});

/**
 * Alpha, Beta and Gamma stand alone (a tray each); Mkt and Gem are the group "Player kit" and share
 * one tray, keyed by the group's id. The list shows Alpha, Beta, Gamma, Player kit.
 */
function plan(): Project {
  const p = fixtureProject();
  const components = [
    item("a", "Alpha"),
    item("b", "Beta"),
    item("c", "Gamma"),
    item("m1", "Mkt"),
    item("m2", "Gem"),
  ];
  const groups = [
    {
      id: "kit",
      name: "Player kit",
      copies: 1,
      access: "often" as const,
      memberIds: ["m1", "m2"],
    },
  ];
  const trays = [
    makeTray({ key: "a:p0:0", path: "0", compartments: [well("a", "Alpha ×20")] }),
    makeTray({ key: "b:p0:0", path: "1", compartments: [well("b", "Beta ×20")] }),
    makeTray({ key: "c:p0:0", path: "2", compartments: [well("c", "Gamma ×20")] }),
    makeTray({
      key: "kit:p0:0",
      path: "3",
      compartments: [well("m1", "Mkt ×30"), well("m2", "Gem ×12")],
    }),
  ];
  const next = { ...p, components, groups, locks: [] };
  return { ...next, layout: makeLayout(inputsHash(next), trays) };
}
const noPlan = (): Project => {
  const p = { ...plan() };
  delete p.layout;
  return p;
};

const railEl = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });
const rowOf = (id: string): HTMLElement =>
  railEl().querySelector(`[data-row-id="${id}"]`) as HTMLElement;
const pressedIds = (root: HTMLElement = railEl()): string[] =>
  [...root.querySelectorAll<HTMLElement>("[data-row-id]")]
    .filter((r) => r.getAttribute("aria-pressed") === "true")
    .map((r) => r.dataset.rowId ?? "");
// the editor's panel is named by its item's (or group's) name; the phone sheet's says "Edit <name>"
const editor = (name: string): HTMLElement | null => screen.queryByRole("region", { name });
const said = (): string => document.querySelector('[data-live="rail"]')?.textContent ?? "";
/** The list's entries (an item's row, or a group's card), top to bottom, by id. */
const order = (): string[] =>
  [...railEl().querySelectorAll<HTMLElement>(".rail-list > li[data-entry]")].map(
    (li) => li.dataset.entry ?? "",
  );

describe("a press on a row", () => {
  it("selects its tray, presses its row and opens no editor", () => {
    const { store } = renderApp({ project: plan() });
    fireEvent.click(rowOf("b"));
    expect(store.state.selection.value).toBe("b:p0:0");
    expect(rowOf("b").getAttribute("aria-pressed")).toBe("true");
    expect(pressedIds()).toEqual(["b"]);
    expect(editor("Beta")).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    // the list is still there
    expect(rowOf("a")).toBeTruthy();
  });

  it("moves the selection from one row to the next", () => {
    const { store } = renderApp({ project: plan() });
    fireEvent.click(rowOf("b"));
    fireEvent.click(rowOf("c"));
    expect(store.state.selection.value).toBe("c:p0:0");
    expect(pressedIds()).toEqual(["c"]);
  });

  it("selects a group member's tray, which is the group's: the group's header is pressed", () => {
    const { store } = renderApp({ project: plan() });
    fireEvent.click(rowOf("m2"));
    expect(store.state.selection.value).toBe("kit:p0:0");
    expect(railEl().querySelector('[data-group-head="kit"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(editor("Gem")).toBeNull();
  });

  it("on a group's header selects the group's trays and opens nothing", () => {
    const { store } = renderApp({ project: plan() });
    const head = railEl().querySelector('[data-group-head="kit"]') as HTMLElement;
    fireEvent.click(head);
    expect(store.state.selection.value).toBe("kit:p0:0");
    expect(head.getAttribute("aria-pressed")).toBe("true");
    expect(editor("Player kit")).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("falls back to opening the editor when there is no plan to select in", () => {
    const { store } = renderApp({ project: noPlan() });
    fireEvent.click(rowOf("b"));
    expect(store.state.selection.value).toBeNull();
    expect(editor("Beta")).not.toBeNull();
  });
});

describe("opening an editor from the list", () => {
  it("opens an item's with its pencil, and the row's press selects nothing more", () => {
    renderApp({ project: plan() });
    fireEvent.click(within(railEl()).getByRole("button", { name: "Edit Beta" }));
    expect(editor("Beta")).not.toBeNull();
    expect(railEl().querySelector(".rail-list")).toBeNull();
  });

  it("opens an item's with a double click on its row", () => {
    renderApp({ project: plan() });
    fireEvent.dblClick(rowOf("c"));
    expect(editor("Gamma")).not.toBeNull();
  });

  it("opens a member's with its pencil", () => {
    renderApp({ project: plan() });
    fireEvent.click(within(railEl()).getByRole("button", { name: "Edit Gem" }));
    expect(editor("Gem")).not.toBeNull();
  });

  it("opens a group's with its pencil, and with a double click on its header", () => {
    renderApp({ project: plan() });
    fireEvent.click(within(railEl()).getByRole("button", { name: "Edit Player kit" }));
    expect(editor("Player kit")).not.toBeNull();
    fireEvent.click(within(railEl()).getByRole("button", { name: "Done" }));
    expect(editor("Player kit")).toBeNull();
    fireEvent.dblClick(railEl().querySelector('[data-group-head="kit"]') as HTMLElement);
    expect(editor("Player kit")).not.toBeNull();
  });
});

describe("leaving an editor", () => {
  const open = (): void => {
    fireEvent.click(within(railEl()).getByRole("button", { name: "Edit Beta" }));
    expect(editor("Beta")).not.toBeNull();
  };

  it("with Done", () => {
    renderApp({ project: plan() });
    open();
    fireEvent.click(within(railEl()).getByRole("button", { name: "Done" }));
    expect(editor("Beta")).toBeNull();
    expect(rowOf("b")).toBeTruthy();
  });

  it("with the back link", () => {
    renderApp({ project: plan() });
    open();
    fireEvent.click(within(railEl()).getByRole("button", { name: "What's inside" }));
    expect(editor("Beta")).toBeNull();
    expect(rowOf("b")).toBeTruthy();
  });

  it("with Escape pressed inside it", () => {
    renderApp({ project: plan() });
    open();
    const panel = editor("Beta") as HTMLElement;
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(editor("Beta")).toBeNull();
    expect(rowOf("b")).toBeTruthy();
  });

  it("with Escape inside a group's editor", () => {
    renderApp({ project: plan() });
    fireEvent.click(within(railEl()).getByRole("button", { name: "Edit Player kit" }));
    fireEvent.keyDown(editor("Player kit") as HTMLElement, { key: "Escape" });
    expect(editor("Player kit")).toBeNull();
  });

  it("when another item's tray is selected in the plan", () => {
    const { store } = renderApp({ project: plan() });
    open();
    act(() => {
      store.state.selection.value = "c:p0:0";
    });
    expect(editor("Beta")).toBeNull();
    expect(pressedIds()).toEqual(["c"]);
  });

  it("stays open when the tray selected is the edited item's own", () => {
    const { store } = renderApp({ project: plan() });
    open();
    act(() => {
      store.state.selection.value = "b:p0:0";
    });
    expect(editor("Beta")).not.toBeNull();
  });

  it("leaves a group's editor for a tray outside the group, and stays for one of its own", () => {
    const { store } = renderApp({ project: plan() });
    fireEvent.click(within(railEl()).getByRole("button", { name: "Edit Player kit" }));
    act(() => {
      store.state.selection.value = "kit:p0:0";
    });
    expect(editor("Player kit")).not.toBeNull();
    act(() => {
      store.state.selection.value = "a:p0:0";
    });
    expect(editor("Player kit")).toBeNull();
  });
});

describe("the phone's sheet", () => {
  /** A phone: the width query the app asks (below 760 px) answers yes. */
  const phone = (): void => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(width < 760px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  };
  const sheet = (): HTMLElement =>
    screen.getByRole("region", { name: "The box and what's inside" });

  it("selects on a press, with aria-pressed, and opens no editor", () => {
    phone();
    const { store } = renderApp({ project: plan() });
    const betaRow = within(sheet()).getByRole("button", { name: /^Beta, / });
    fireEvent.click(betaRow);
    expect(store.state.selection.value).toBe("b:p0:0");
    expect(betaRow.getAttribute("aria-pressed")).toBe("true");
    expect(within(sheet()).queryByRole("region", { name: "Edit Beta" })).toBeNull();
    expect(
      within(sheet())
        .getByRole("button", { name: /^Gamma, / })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("opens the editor with the pencil", () => {
    phone();
    renderApp({ project: plan() });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Edit Beta" }));
    expect(within(sheet()).getByRole("region", { name: "Edit Beta" })).toBeTruthy();
  });

  it("has no grips", () => {
    phone();
    renderApp({ project: plan() });
    expect(sheet().querySelector("[data-grip]")).toBeNull();
  });
});

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
 * The list 0..600 in the order `order()` reads it now: each item 40 high with a 10 gap; a group's
 * card takes 150 (header 0..40, members 40 high each).
 */
function drawRail(): void {
  const list = railEl().querySelector(".rail-list") as HTMLElement;
  at(list, 0, 600);
  let y = 0;
  for (const li of list.querySelectorAll<HTMLElement>(":scope > li[data-entry]")) {
    const card = li.querySelector<HTMLElement>(".gc");
    const height = card === null ? 40 : 150;
    at(li, y, y + height);
    if (card !== null) {
      at(card, y, y + height);
      at(card.querySelector(".gc-members"), y + 50, y + 140);
      const members = card.querySelectorAll<HTMLElement>("[data-member-id]");
      members.forEach((m, i) => at(m, y + 50 + i * 45, y + 90 + i * 45));
    }
    y += height + 10;
  }
}

/** Drags a grip from the middle of its entry to y; returns the release. */
function drag(id: string, toY: number) {
  drawRail();
  const grip = railEl().querySelector(`[data-grip="${id}"]`) as HTMLElement;
  const from = { x: 20, y: (grip.closest("li")?.getBoundingClientRect().top ?? 0) + 10 };
  fireEvent.pointerDown(grip, { clientX: from.x, clientY: from.y, button: 0, pointerId: 1 });
  fireEvent.pointerMove(document.body, {
    clientX: from.x + 10,
    clientY: from.y + 10,
    pointerId: 1,
  });
  fireEvent.pointerMove(document.body, { clientX: 100, clientY: toY, pointerId: 1 });
  return {
    release: () => fireEvent.pointerUp(document.body, { clientX: 100, clientY: toY, pointerId: 1 }),
  };
}

describe("reordering the list by a drag", () => {
  // entries: Alpha 0..40, Beta 50..90, Gamma 100..140, Player kit 150..300
  it("moves an ungrouped item to a new place: listOrder, the list and one undo step", () => {
    const p = plan();
    const { store } = renderApp({ project: p });
    expect(order()).toEqual(["a", "b", "c", "kit"]);
    expect(store.canUndo.peek()).toBe(false);
    act(() => {
      drag("c", 5).release();
    });
    const after = store.state.project.value;
    expect(after.listOrder?.slice(0, 3)).toEqual(["c", "a", "b"]);
    expect(order()).toEqual(["c", "a", "b", "kit"]);
    expect(said()).toBe("Gamma is now first.");
    // the components and the plan are the same
    expect(after.components).toEqual(p.components);
    expect(inputsHash(after)).toBe(inputsHash(p));
    expect(after.layout?.inputsHash).toBe(p.layout?.inputsHash);
    // one undo step puts it back
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.listOrder).toBeUndefined();
    expect(order()).toEqual(["a", "b", "c", "kit"]);
    expect(store.canUndo.peek()).toBe(false);
  });

  it("moves an item below a group's card, and says what it is after by the group's name", () => {
    const { store } = renderApp({ project: plan() });
    act(() => {
      drag("a", 450).release();
    });
    expect(order()).toEqual(["b", "c", "kit", "a"]);
    expect(said()).toBe("Alpha is now after Player kit.");
    expect(store.state.project.value.groups?.[0]?.memberIds).toEqual(["m1", "m2"]);
  });

  it("moves an item between two others, said by the one before it", () => {
    renderApp({ project: plan() });
    act(() => {
      drag("a", 95).release();
    });
    expect(order()).toEqual(["b", "a", "c", "kit"]);
    expect(said()).toBe("Alpha is now after Beta.");
  });

  it("keeps the list order through serialize and parse", () => {
    const { store } = renderApp({ project: plan() });
    act(() => {
      drag("c", 5).release();
    });
    const text = serializeProject(store.state.project.value, noForeign());
    const r = parseProject(JSON.parse(text));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.listOrder).toEqual(store.state.project.value.listOrder);
    }
  });

  it("makes no step for a drop where the item already stands, or outside the list", () => {
    const { store } = renderApp({ project: plan() });
    act(() => {
      drag("b", 70).release();
    });
    act(() => {
      drag("b", 900).release();
    });
    expect(store.canUndo.peek()).toBe(false);
    expect(store.state.project.value.listOrder).toBeUndefined();
  });

  it("puts an item into a group", () => {
    const { store } = renderApp({ project: plan() });
    act(() => {
      drag("a", 243).release();
    });
    // the pointer is over the card's members, between the first and the second
    expect(store.state.project.value.groups?.[0]?.memberIds).toEqual(["m1", "a", "m2"]);
    expect(said()).toContain("Alpha moved to Player kit.");
  });

  it("takes a member out of a group to the chosen place in the list", () => {
    const { store } = renderApp({ project: plan() });
    act(() => {
      drag("m1", 5).release();
    });
    const after = store.state.project.value;
    expect(after.groups?.[0]?.memberIds).toEqual(["m2"]);
    expect(after.listOrder?.slice(0, 2)).toEqual(["m1", "a"]);
    expect(order()).toEqual(["m1", "a", "b", "c", "kit"]);
    expect(said()).toContain("Mkt is out of Player kit.");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.groups?.[0]?.memberIds).toEqual(["m1", "m2"]);
    expect(order()).toEqual(["a", "b", "c", "kit"]);
    expect(store.canUndo.peek()).toBe(false);
  });

  it("takes a member out to the end of the list", () => {
    renderApp({ project: plan() });
    act(() => {
      drag("m2", 550).release();
    });
    expect(order()).toEqual(["a", "b", "c", "kit", "m2"]);
  });
});

describe("reordering the list from the keyboard", () => {
  const altKey = (id: string, key: "ArrowUp" | "ArrowDown"): void => {
    fireEvent.keyDown(rowOf(id), { key, altKey: true });
  };

  it("moves an item one place down with Alt+ArrowDown, keeps the focus on its row and says where it went", () => {
    const { store } = renderApp({ project: plan() });
    rowOf("a").focus();
    act(() => altKey("a", "ArrowDown"));
    expect(order()).toEqual(["b", "a", "c", "kit"]);
    expect(document.activeElement).toBe(rowOf("a"));
    expect(said()).toBe("Alpha is now after Beta.");
    expect(store.canUndo.peek()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(order()).toEqual(["a", "b", "c", "kit"]);
  });

  it("moves it one place up with Alt+ArrowUp, to first when it reaches the top", () => {
    renderApp({ project: plan() });
    rowOf("b").focus();
    act(() => altKey("b", "ArrowUp"));
    expect(order()).toEqual(["b", "a", "c", "kit"]);
    expect(document.activeElement).toBe(rowOf("b"));
    expect(said()).toBe("Beta is now first.");
  });

  it("steps over a group's card as one place", () => {
    renderApp({ project: plan() });
    rowOf("c").focus();
    act(() => altKey("c", "ArrowDown"));
    expect(order()).toEqual(["a", "b", "kit", "c"]);
    expect(said()).toBe("Gamma is now after Player kit.");
    act(() => altKey("c", "ArrowUp"));
    expect(order()).toEqual(["a", "b", "c", "kit"]);
  });

  it("keeps the plan and the components as they were", () => {
    const p = plan();
    const { store } = renderApp({ project: p });
    act(() => altKey("a", "ArrowDown"));
    expect(store.state.project.value.components).toEqual(p.components);
    expect(inputsHash(store.state.project.value)).toBe(inputsHash(p));
  });

  it("does nothing at the ends", () => {
    const { store } = renderApp({ project: plan() });
    act(() => altKey("a", "ArrowUp"));
    expect(order()).toEqual(["a", "b", "c", "kit"]);
    expect(store.canUndo.peek()).toBe(false);
    expect(said()).toBe("");
  });

  it("does nothing without Alt", () => {
    const { store } = renderApp({ project: plan() });
    fireEvent.keyDown(rowOf("a"), { key: "ArrowDown" });
    expect(order()).toEqual(["a", "b", "c", "kit"]);
    expect(store.canUndo.peek()).toBe(false);
  });

  it("orders a member within its group", () => {
    const { store } = renderApp({ project: plan() });
    rowOf("m1").focus();
    act(() => altKey("m1", "ArrowDown"));
    expect(store.state.project.value.groups?.[0]?.memberIds).toEqual(["m2", "m1"]);
    expect(document.activeElement).toBe(rowOf("m1"));
    expect(said()).toBe("Mkt is now after Gem.");
    act(() => altKey("m1", "ArrowUp"));
    expect(store.state.project.value.groups?.[0]?.memberIds).toEqual(["m1", "m2"]);
    expect(said()).toBe("Mkt is now first.");
  });

  it("does nothing for a member at an end of its group", () => {
    const { store } = renderApp({ project: plan() });
    act(() => altKey("m1", "ArrowUp"));
    act(() => altKey("m2", "ArrowDown"));
    expect(store.state.project.value.groups?.[0]?.memberIds).toEqual(["m1", "m2"]);
    expect(store.canUndo.peek()).toBe(false);
  });
});
