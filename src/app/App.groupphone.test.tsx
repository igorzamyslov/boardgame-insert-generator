// src/app/App.groupphone.test.tsx
// @vitest-environment jsdom
// Groups on the phone (0.7.0 Task 15, G4): the sheet lists a group as a frame with a compact header
// and indented member rows, and has no grips; the header opens the group's editor in the sheet, a
// member opens its own; the count is items; Move to group… opens in the sheet; Up and Down work.
import { cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hoveredComponent, hoveredMembers } from "../screens/hover";
import { loadSeed } from "../test-support/harbourKings";
import type { Project } from "../model/types";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(width < 760px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  hoveredComponent.value = null;
  hoveredMembers.value = null;
});

const kit = (): Project => loadSeed("harbour-kings-kit").project;
const sheet = (): HTMLElement => screen.getByRole("region", { name: "The box and what's inside" });
const open = (): void => {
  fireEvent.click(within(sheet()).getByRole("button", { name: "Show everything" }));
};
const card = (): HTMLElement =>
  within(sheet()).getByRole("group", { name: "Player kit, 4 copies" });
const names = (store: ReturnType<typeof renderApp>["store"]): string[] => {
  const p = store.state.project.value;
  return (p.groups?.[0]?.memberIds ?? []).map(
    (id) => p.components.find((c) => c.id === id)?.name ?? "?",
  );
};

describe("the group card in the phone's sheet", () => {
  it("is a frame with a compact header (a neutral swatch, the name, ×4, 3 items) and the members under it", () => {
    renderApp({ project: kit() });
    open();
    const header = within(card()).getByRole("button", { name: "Player kit, 4 copies" });
    expect(header.classList.contains("k-row--compact")).toBe(true);
    expect(header.querySelector(".k-row__swatch--group")).not.toBeNull();
    expect(header.querySelector(".k-tile")).toBeNull();
    expect(header.querySelector(".k-row__name")?.textContent).toBe("Player kit");
    expect(header.querySelector(".gc-head__copies")?.textContent).toBe("×4");
    expect(header.querySelector(".k-row__meta")?.textContent).toBe("3 items");
    const members = card().querySelectorAll(".gc-members > .gc-member .k-row--compact");
    expect([...members].map((m) => m.querySelector(".k-row__name")?.textContent)).toEqual([
      "Starter deck",
      "Resources",
      "Hero",
    ]);
  });

  it("has no grips and starts no drag", () => {
    renderApp({ project: kit() });
    open();
    expect(sheet().querySelector("[data-grip], .gc-grip")).toBeNull();
  });

  it("counts items beside the title, not the group", () => {
    const p = kit();
    renderApp({ project: p });
    open();
    expect(sheet().querySelector(".k-sheet__handle")?.textContent).toBe(
      `What's inside${p.components.length}`,
    );
  });
});

describe("opening from the sheet", () => {
  it("the header opens the group's editor in the sheet, a member opens its own", () => {
    renderApp({ project: kit() });
    open();
    // a press on the header selects the group's tray and opens nothing; the pencil opens the editor
    fireEvent.click(within(card()).getByRole("button", { name: "Player kit, 4 copies" }));
    expect(within(sheet()).queryByRole("region", { name: "Edit Player kit" })).toBeNull();
    fireEvent.click(within(card()).getByRole("button", { name: "Edit Player kit" }));
    const panel = within(sheet()).getByRole("region", { name: "Edit Player kit" });
    expect(within(panel).getByRole("heading", { level: 1 }).textContent).toBe("Player kit");
    fireEvent.click(within(panel).getByRole("button", { name: "Back" }));
    fireEvent.click(within(card()).getByRole("button", { name: "Edit Hero" }));
    expect(within(sheet()).getByRole("region", { name: "Edit Hero" })).toBeTruthy();
  });

  it("Up and Down in the sheet's group editor reorder the items, one undo step each", () => {
    const { store } = renderApp({ project: kit() });
    open();
    fireEvent.click(within(card()).getByRole("button", { name: "Edit Player kit" }));
    const panel = within(sheet()).getByRole("region", { name: "Edit Player kit" });
    expect(names(store)).toEqual(["Starter deck", "Resources", "Hero"]);
    fireEvent.click(within(panel).getByRole("button", { name: "Move Hero up" }));
    expect(names(store)).toEqual(["Starter deck", "Hero", "Resources"]);
    fireEvent.click(within(panel).getByRole("button", { name: "Move Starter deck down" }));
    expect(names(store)).toEqual(["Hero", "Starter deck", "Resources"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(names(store)).toEqual(["Starter deck", "Hero", "Resources"]);
  });

  it("Move to group… opens in the sheet, and the item lands in the group's card", () => {
    const { store } = renderApp({ project: kit() });
    open();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Edit Market deck" }));
    const panel = within(sheet()).getByRole("region", { name: "Edit Market deck" });
    fireEvent.click(within(panel).getByRole("button", { name: /^Copies and group/ }));
    fireEvent.click(within(panel).getByRole("button", { name: /^Move to group/ }));
    const menu = within(sheet()).getByRole("group", { name: "Move to group…" });
    fireEvent.click(within(menu).getByRole("button", { name: /^Player kit/ }));
    expect(names(store)).toEqual(["Starter deck", "Resources", "Hero", "Market deck"]);
    fireEvent.click(within(panel).getByRole("button", { name: "Back" }));
    expect(within(card()).getByRole("button", { name: /^Market deck, / })).toBeTruthy();
  });
});
