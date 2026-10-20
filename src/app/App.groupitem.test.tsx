// src/app/App.groupitem.test.tsx
// @vitest-environment jsdom
// An item's editor and groups (0.7.0 Task 12, spec §7.3 and §7.5): Copies, the Group row (Move to
// group…, New group, Edit <group>, Take out of group), "In <group>" under the name, and what a
// member's editor leaves out. Each change is one undo step, and its note shows in the stage's slot.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
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
  vi.unstubAllGlobals();
  hoveredComponent.value = null;
  hoveredMembers.value = null;
});

const kit = (): Project => loadSeed("harbour-kings-kit").project;
const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });
const openItem = (name: RegExp): void => {
  fireEvent.click(within(rail()).getByRole("button", { name }));
};
const openMore = (): void => {
  fireEvent.click(within(rail()).getByRole("button", { name: /^More options/ }));
};
const row = (name: RegExp | string) => within(rail()).getByRole("button", { name });
const slot = (): string => document.querySelector(".ed-slot")?.textContent ?? "";
const idOf = (p: Project, name: string): string =>
  p.components.find((c) => c.name === name)?.id ?? "?";
const stepper = (): HTMLElement =>
  within(rail()).getByRole("textbox", { name: "Copies" }).closest(".k-stepper-box") as HTMLElement;

describe("Copies on an item in no group", () => {
  it("sets the item's copies as one undo step, and the stage counts the trays", () => {
    const { store } = renderApp({ project: kit() });
    openItem(/^Market deck, /);
    openMore();
    fireEvent.click(row(/^Copies/));
    fireEvent.click(within(stepper()).getByRole("button", { name: "More" }));
    const market = (): number | undefined =>
      store.state.project.value.components.find((c) => c.name === "Market deck")?.copies;
    expect(market()).toBe(2);
    expect(row(/^Copies/).querySelector(".k-drow__dot")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(market()).toBeUndefined();
  });

  it("says in the slot which pins went with the copies that went", () => {
    const base = kit();
    const id = idOf(base, "Market deck");
    const { store } = renderApp({
      project: {
        ...base,
        components: base.components.map((c) => (c.id === id ? { ...c, copies: 3 } : c)),
        locks: [{ kind: "position", trayKey: `${id}:p2:0`, path: "0", rotated: false }],
      },
    });
    openItem(/^Market deck, /);
    openMore();
    fireEvent.click(row(/^Copies/));
    fireEvent.click(within(stepper()).getByRole("button", { name: "Fewer" }));
    expect(store.state.project.value.locks).toHaveLength(0);
    expect(slot()).toContain("1 pin removed.");
  });
});

describe("Move to group…", () => {
  it("lists each group with ×N and 'New group'; moving into one with other copies says so", () => {
    const { store } = renderApp({ project: kit() });
    openItem(/^Market deck, /);
    openMore();
    fireEvent.click(row(/^Group/));
    fireEvent.click(row(/^Move to group…/));
    const panel = within(rail()).getByRole("group", { name: "Move to group…" });
    expect(
      within(panel)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Player kit ×4", "New group"]);
    fireEvent.click(within(panel).getByRole("button", { name: /^Player kit/ }));
    const p = store.state.project.value;
    expect(p.groups?.[0]?.memberIds.at(-1)).toBe(idOf(p, "Market deck"));
    expect(slot()).toContain("Market deck now has the group's 4 copies.");
    // the editor is the member's now: In <group> under the name, the Group row on the group's name
    expect(within(rail()).getByRole("button", { name: "In Player kit" })).toBeTruthy();
    expect(row(/^Group/).textContent).toContain("Player kit");
    expect(within(rail()).queryByRole("button", { name: /^Copies/ })).toBeNull();
    expect(within(rail()).queryByRole("group", { name: "How often you reach for it" })).toBeNull();
    expect(
      within(rail()).getByText("Copies and how often you reach for it are set on Player kit."),
    ).toBeTruthy();
    // one undo step
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.groups?.[0]?.memberIds).not.toContain(idOf(p, "Market deck"));
    expect(within(rail()).queryByRole("button", { name: "In Player kit" })).toBeNull();
  });

  it("says nothing of copies when the number is the same", () => {
    const base = kit();
    const id = idOf(base, "Market deck");
    renderApp({
      project: {
        ...base,
        components: base.components.map((c) => (c.id === id ? { ...c, copies: 4 } : c)),
      },
    });
    openItem(/^Market deck, /);
    openMore();
    fireEvent.click(row(/^Group/));
    fireEvent.click(row(/^Move to group…/));
    fireEvent.click(row(/^Player kit/));
    expect(slot()).not.toMatch(/copies/);
  });

  it("'New group' makes a group of this item with its copies, and no note about copies", () => {
    const base = kit();
    const id = idOf(base, "Market deck");
    const { store } = renderApp({
      project: {
        ...base,
        components: base.components.map((c) => (c.id === id ? { ...c, copies: 3 } : c)),
      },
    });
    openItem(/^Market deck, /);
    openMore();
    fireEvent.click(row(/^Group/));
    fireEvent.click(row(/^Move to group…/));
    fireEvent.click(row("New group"));
    const p = store.state.project.value;
    expect(p.groups).toHaveLength(2);
    expect(p.groups?.[1]).toMatchObject({ name: "Group", copies: 3, memberIds: [id] });
    expect(p.components.find((c) => c.id === id)?.copies).toBeUndefined();
    expect(slot()).not.toMatch(/copies/);
    expect(within(rail()).getByRole("button", { name: "In Group" })).toBeTruthy();
    // focus is on the row's first button, its old one being gone
    expect(document.activeElement).toBe(row("Edit Group"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.groups).toHaveLength(1);
  });
});

describe("a member's editor", () => {
  it("has 'In Player kit' under the name, which opens the group's editor", () => {
    renderApp({ project: kit() });
    openItem(/^Hero, /);
    fireEvent.click(within(rail()).getByRole("button", { name: "In Player kit" }));
    expect(within(rail()).getByRole("region", { name: "Player kit" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Player kit, 4 trays.");
  });

  it("'Edit Player kit' in the Group row opens it too", () => {
    renderApp({ project: kit() });
    openItem(/^Hero, /);
    openMore();
    fireEvent.click(row(/^Group/));
    fireEvent.click(row("Edit Player kit"));
    expect(within(rail()).getByRole("region", { name: "Player kit" })).toBeTruthy();
  });

  it("'Take out of group' gives the item the group's copies and says so", () => {
    const { store } = renderApp({ project: kit() });
    openItem(/^Hero, /);
    openMore();
    fireEvent.click(row(/^Group/));
    fireEvent.click(row("Take out of group"));
    const p = store.state.project.value;
    expect(p.groups?.[0]?.memberIds).not.toContain(idOf(p, "Hero"));
    expect(p.components.find((c) => c.name === "Hero")?.copies).toBe(4);
    expect(slot()).toContain("Hero is out of Player kit.");
    expect(row(/^Group/).textContent).toContain("None");
    expect(within(rail()).getByRole("button", { name: /^Copies/ })).toBeTruthy();
    expect(within(rail()).queryByRole("button", { name: /^In Player kit/ })).toBeNull();
    expect(document.activeElement).toBe(row(/^Move to group…/));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.groups?.[0]?.memberIds).toContain(idOf(p, "Hero"));
  });

  it("opened from the group's editor, its back link reads the group's name", () => {
    renderApp({ project: kit() });
    fireEvent.click(within(rail()).getByRole("button", { name: "Player kit, 4 copies" }));
    fireEvent.click(within(rail()).getByRole("button", { name: "Hero" }));
    expect(within(rail()).getByRole("button", { name: "Player kit" })).toBeTruthy();
  });

  it("gives its own compartments a 2 px ink outline while the group's trays are lifted", () => {
    renderApp({ project: kit() });
    openItem(/^Hero, /);
    expect(document.querySelectorAll(".plan-tile.is-lifted[data-key]")).toHaveLength(4);
    const own = document.querySelectorAll(".plan-tile.is-lifted .plan-cell.is-own");
    // one Hero well in each of the four trays
    expect(own).toHaveLength(4);
    // a member of no group, or the group's editor, outlines nothing
    cleanup();
    renderApp({ project: kit() });
    openItem(/^Market deck, /);
    expect(document.querySelectorAll(".plan-cell.is-own")).toHaveLength(0);
  });
});

describe("the order-blocked finger cut", () => {
  it("is told under the plan with the engine's other notes while a member's editor is open", () => {
    const base = kit();
    const warning =
      "Starter deck has no finger cut here. Move it to the start of Player kit for one.";
    const { store } = renderApp({ project: base });
    act(() => {
      store.state.lastResult.value = {
        layout: store.state.project.value.layout ?? null,
        bestAttempt: null,
        summary: null,
        notices: [
          {
            level: "warning",
            code: "sizing.noFingerSlot",
            path: "/components/0",
            message: warning,
          },
        ],
        lockConflicts: [],
      };
    });
    openItem(/^Starter deck, /);
    expect(
      within(document.querySelector(".stage-notes") as HTMLElement).getByText(warning),
    ).toBeTruthy();
    // it is not the editor's: nothing in the rail is marked as an error for it
    expect(within(rail()).queryByRole("alert")).toBeNull();
  });
});
