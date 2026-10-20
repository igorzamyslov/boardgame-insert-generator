// src/app/App.groupcard.test.tsx
// @vitest-environment jsdom
// Groups in the rail (0.7.0 Task 9): the card in the list, Add → Group, and the lighting. G1, G3.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hoveredComponent, hoveredMembers } from "../screens/hover";
import { loadSeed } from "../test-support/harbourKings";
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

const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });
const cards = (): HTMLElement[] =>
  within(rail()).queryAllByRole("group", { name: /, (empty|\d+ cop)/ });

function addGroup(): void {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(
    within(screen.getByRole("group", { name: "Add something inside" })).getByRole("button", {
      name: "Group",
    }),
  );
}

describe("Add → Group", () => {
  it("adds an empty group at the end and puts the focus on its header", () => {
    const { store } = renderApp({ project: loadSeed("harbour-kings-kit-loose").project });
    expect(store.state.project.value.groups ?? []).toHaveLength(0);
    addGroup();
    const groups = store.state.project.value.groups ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "Group", memberIds: [] });
    // the picker is closed, the card stands last and its header has the focus
    expect(screen.queryByRole("group", { name: "Add something inside" })).toBeNull();
    const card = screen.getByRole("group", { name: "Group, empty" });
    expect(card.getAttribute("data-region")).toBe("group-card");
    const entries = [...(document.querySelector(".rail-list")?.children ?? [])];
    expect(entries.at(-1)?.contains(card)).toBe(true);
    const head = within(card).getByRole("button", { name: "Group, empty" });
    expect(document.activeElement).toBe(head);
    // it does not open an editor: the list is still there
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(
      within(card).getByText("Drag items here, or use Move to group… in an item."),
    ).toBeTruthy();
  });

  it("names the next one Group 2, and keeps the first", () => {
    renderApp({ project: loadSeed("harbour-kings-kit-loose").project });
    addGroup();
    addGroup();
    expect(screen.getByRole("group", { name: "Group, empty" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Group 2, empty" })).toBeTruthy();
    expect(cards()).toHaveLength(2);
  });

  it("is one undo step, and leaves the plan current (an empty group is not in the plan)", () => {
    const { store } = renderApp({ project: loadSeed("harbour-kings-kit-loose").project });
    expect(store.state.stale.value).toBe(false);
    addGroup();
    expect(store.state.stale.value).toBe(false);
    expect(screen.queryByRole("button", { name: "Make a new plan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.groups ?? []).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Group, empty" })).toBeNull();
    expect(store.state.history.canUndo.value).toBe(false);
  });

  it("is a step of its own, not merged into the edit just before it", () => {
    const { store } = renderApp({ project: loadSeed("harbour-kings-kit-loose").project });
    act(() => {
      store.edit((q) => ({ ...q, name: "Harbour Kings, second box" }));
    });
    addGroup();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.groups ?? []).toHaveLength(0);
    expect(store.state.project.value.name).toBe("Harbour Kings, second box");
  });
});

describe("a group in the list", () => {
  it("is a card where its first member stands, with the members inside it", () => {
    renderApp({ project: loadSeed("harbour-kings-kit").project });
    const [card] = cards();
    expect(card?.getAttribute("aria-label")).toBe("Player kit, 4 copies");
    const head = within(card as HTMLElement).getByRole("button", { name: "Player kit, 4 copies" });
    expect(head.textContent).toContain("3 items · 4 trays");
    expect(
      within(card as HTMLElement)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual(["Starter deck", "Resources", "Hero"]);
  });

  it("presses its header when one of its trays is chosen", () => {
    renderApp({ project: loadSeed("harbour-kings-kit").project });
    const tile = document.querySelector('.plan-tile[data-key$=":p1:0"]') as HTMLElement;
    expect(tile, "the plan has the second copy's tray").not.toBeNull();
    fireEvent.keyDown(tile, { key: "Enter" });
    const head = within(rail()).getByRole("button", { name: "Player kit, 4 copies" });
    expect(head.getAttribute("aria-pressed")).toBe("true");
    expect(
      within(rail())
        .getByRole("button", { name: /^Market deck,/ })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("lights every tray of the group while the pointer is on a member, and none after it leaves", () => {
    renderApp({ project: loadSeed("harbour-kings-kit").project });
    const kitTiles = (): HTMLElement[] =>
      [...document.querySelectorAll<HTMLElement>(".plan-tile")].filter((t) =>
        /^plrkit01:p\d:0$/.test(t.dataset.key ?? ""),
      );
    expect(kitTiles()).toHaveLength(4);
    fireEvent.mouseEnter(within(rail()).getByRole("button", { name: /^Resources,/ }));
    expect(hoveredMembers.value).toEqual(["kitdeck1", "kitres01", "kithero1"]);
    for (const t of kitTiles()) {
      expect(t.classList.contains("is-dimmed")).toBe(false);
    }
    const market = document.querySelector('.plan-tile[data-key^="market01"]');
    expect(market?.classList.contains("is-dimmed")).toBe(true);
    fireEvent.mouseLeave(within(rail()).getByRole("button", { name: /^Resources,/ }));
    expect(hoveredMembers.value).toBeNull();
    expect(document.querySelectorAll(".plan-tile.is-dimmed")).toHaveLength(0);
  });

  it("lifts one rule from every tray of the group in one undo step", () => {
    const kit = loadSeed("harbour-kings-kit").project;
    const { store } = renderApp({
      project: {
        ...kit,
        locks: [
          { kind: "position", trayKey: "plrkit01:p0:0", path: "0", rotated: false },
          { kind: "position", trayKey: "plrkit01:p1:0", path: "1", rotated: false },
        ],
      },
    });
    const chips = within(rail()).getByRole("list", { name: "Rules for Player kit" });
    fireEvent.click(within(chips).getByRole("button", { name: "Unpin Player kit" }));
    expect(store.state.project.value.locks).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.locks).toHaveLength(2);
    expect(store.state.history.canUndo.value).toBe(false);
  });
});
