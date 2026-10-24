// src/app/App.groupeditor.test.tsx
// @vitest-environment jsdom
// The group editor (0.7.0 Task 11, G2): it opens from the card's header, the tray bar's Edit and the
// status heading's "Edit <group>"; Copies, access and the order of the items are one undo step each;
// Remove group… asks in place and is one step with its note and Undo removal.
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
const openFromCard = (): void => {
  fireEvent.click(within(rail()).getByRole("button", { name: "Edit Player kit" }));
};
const names = (store: ReturnType<typeof renderApp>["store"]): string[] => {
  const p = store.state.project.value;
  return (p.groups?.[0]?.memberIds ?? []).map(
    (id) => p.components.find((c) => c.id === id)?.name ?? "?",
  );
};
/** The timers of a moment (the focus a button hands on is set after the render). */
const later = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
const toast = (): string => document.querySelector(".removed-toast")?.textContent ?? "";
const said = (): string => document.querySelector('[data-live="rail"]')?.textContent ?? "";

describe("opening the group's editor", () => {
  it("opens from the card's header, in the list's place, with the stage sentence as the page's h1", () => {
    renderApp({ project: kit() });
    openFromCard();
    // the list is gone and the editor stands in the rail
    expect(within(rail()).queryByRole("list", { name: "What's inside" })).toBeNull();
    const panel = within(rail()).getByRole("region", { name: "Player kit" });
    expect(within(panel).getByRole("button", { name: "What's inside" })).toBeTruthy();
    // the page's one h1 is the stage's sentence
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]?.textContent).toBe("Player kit, 4 trays.");
    // the editor's heading names the panel and has the focus
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.textContent).toBe("Player kit");
  });

  it("lifts the trays its sentence counts, by the key's stem: a stale plan's item-keyed tray is not the group's", () => {
    const base = kit();
    const trays = (base.layout?.trays ?? []).map((t) =>
      t.key === "plrkit01:p3:0" ? { ...t, key: "kitdeck1:p3:0" } : t,
    );
    renderApp({ project: { ...base, layout: base.layout && { ...base.layout, trays } } });
    openFromCard();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Player kit, 3 trays.");
    expect(document.querySelectorAll(".plan-tile.is-lifted[data-key]")).toHaveLength(3);
    expect(document.querySelector('.plan-tile[data-key="kitdeck1:p3:0"]')?.className).not.toMatch(
      /is-lifted/,
    );
  });

  it("opens from the tray bar's Edit on one of its trays", () => {
    renderApp({ project: kit() });
    const tile = document.querySelector('.plan-tile[data-key$=":p1:0"]') as HTMLElement;
    fireEvent.keyDown(tile, { key: "Enter" });
    fireEvent.click(
      within(screen.getByRole("region", { name: "Selected tray" })).getByRole("button", {
        name: "Edit",
      }),
    );
    expect(within(rail()).getByRole("region", { name: "Player kit" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Player kit, 4 trays.");
  });

  it("lifts the group's four trays and dims the rest", () => {
    renderApp({ project: kit() });
    openFromCard();
    const lifted = [...document.querySelectorAll<HTMLElement>(".plan-tile.is-lifted[data-key]")];
    expect(lifted).toHaveLength(4);
    expect(lifted.every((t) => t.classList.contains("is-group"))).toBe(true);
    const rest = [...document.querySelectorAll<HTMLElement>(".plan-tile[data-key]")].filter(
      (t) => !t.classList.contains("is-lifted"),
    );
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((t) => t.classList.contains("is-dimmed"))).toBe(true);
  });

  it("returns to the list with the focus on the group's header: the back link, and Done", () => {
    renderApp({ project: kit() });
    openFromCard();
    fireEvent.click(within(rail()).getByRole("button", { name: "What's inside" }));
    expect(document.activeElement).toBe(
      within(rail()).getByRole("button", { name: "Player kit, 4 copies" }),
    );
    openFromCard();
    fireEvent.click(within(rail()).getByRole("button", { name: "Done" }));
    expect(within(rail()).getByRole("button", { name: "Player kit, 4 copies" })).toBe(
      document.activeElement,
    );
  });
});

describe("when a copy of the group does not fit", () => {
  it("offers 'Edit Player kit' in the heading, marks the card, and opens the group's editor", () => {
    const base = kit();
    const trays = (base.layout?.trays ?? []).map((t, i) =>
      i === 0 || !t.key.startsWith("plrkit01:") ? t : { ...t, x: 250, w: 120 },
    );
    const { store } = renderApp({ project: base });
    act(() => {
      store.state.lastResult.value = {
        layout: null,
        bestAttempt: { trays, shortfall: { x: 30, y: 0, z: 0 } },
        summary: null,
        notices: [],
        lockConflicts: [],
      };
      store.state.lastResultHash.value = store.state.currentHash.value;
    });
    // the card says so, as an item's row does
    const head = within(rail()).getByRole("button", { name: "Player kit, 4 copies" });
    expect(head.getAttribute("data-misfit")).toBe("true");
    expect(head.textContent).toContain("Doesn't fit");
    // the fix is the group's editor, called by the group and not by the tray
    fireEvent.click(screen.getAllByRole("button", { name: "Edit Player kit" })[0] as HTMLElement);
    expect(within(rail()).getByRole("region", { name: "Player kit" })).toBeTruthy();
  });
});

describe("what the editor shows", () => {
  it("has the group's name over its name, Copies, access, and the order of its items; no Extra room", () => {
    renderApp({ project: kit() });
    openFromCard();
    const panel = within(rail()).getByRole("region", { name: "Player kit" });
    expect(within(panel).getByText("Group")).toBeTruthy();
    expect((within(panel).getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe(
      "Player kit",
    );
    expect((within(panel).getByRole("textbox", { name: "Copies" }) as HTMLInputElement).value).toBe(
      "4",
    );
    expect(within(panel).getByText("Each copy is its own tray.")).toBeTruthy();
    const often = within(panel).getByRole("button", { name: "Often" });
    expect(often.getAttribute("aria-pressed")).toBe("true");
    const order = within(panel).getByRole("list", { name: "Order in the tray" });
    expect(
      within(order)
        .getAllByRole("listitem")
        .map((li) => li.querySelector(".ed-order__name")?.textContent),
    ).toEqual(["Starter deck", "Resources", "Hero"]);
    expect(within(panel).getByRole("button", { name: "Remove group…" })).toBeTruthy();
    // owner's ruling O2: the group's Extra room is not built, and leaves no placeholder
    expect(document.body.textContent).not.toMatch(/Extra room/);
  });
});

describe("Copies and how often", () => {
  it("steps Copies as one undo step each, and says the stage's sentence again", () => {
    const { store } = renderApp({ project: kit() });
    openFromCard();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(store.state.project.value.groups?.[0]?.copies).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Fewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Fewer" }));
    expect(store.state.project.value.groups?.[0]?.copies).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.groups?.[0]?.copies).toBe(4);
  });

  it("stops at 10", () => {
    const base = kit();
    const group = base.groups?.[0];
    if (group === undefined) {
      throw new Error("the kit seed has a group");
    }
    const { store } = renderApp({ project: { ...base, groups: [{ ...group, copies: 10 }] } });
    fireEvent.click(within(rail()).getByRole("button", { name: "Edit Player kit" }));
    expect(screen.getByRole("button", { name: "More" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(store.state.project.value.groups?.[0]?.copies).toBe(10);
  });

  it("says in the stage's slot which pins went with the copies that went", () => {
    const base = kit();
    const { store } = renderApp({
      project: {
        ...base,
        locks: [{ kind: "position", trayKey: "plrkit01:p3:0", path: "3", rotated: false }],
      },
    });
    openFromCard();
    fireEvent.click(screen.getByRole("button", { name: "Fewer" }));
    expect(store.state.project.value.locks).toHaveLength(0);
    expect(document.body.textContent).toContain("1 pin removed.");
  });

  it("sets how often the group's tray is reached for", () => {
    const { store } = renderApp({ project: kit() });
    openFromCard();
    fireEvent.click(screen.getByRole("button", { name: "Only at setup" }));
    expect(store.state.project.value.groups?.[0]?.access).toBe("setup");
    expect(screen.getByRole("button", { name: "Only at setup" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("renames the group, and the sentence and the card say the new name", () => {
    const { store } = renderApp({ project: kit() });
    openFromCard();
    fireEvent.input(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Crew" },
    });
    expect(store.state.project.value.groups?.[0]?.name).toBe("Crew");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Crew, 4 trays\./);
  });
});

describe("the order in the tray", () => {
  it("moves an item up and down, saying so by names, and keeps the focus on the button pressed", () => {
    const { store } = renderApp({ project: kit() });
    openFromCard();
    const up = (n: string) => screen.getByRole("button", { name: `Move ${n} up` });
    const down = (n: string) => screen.getByRole("button", { name: `Move ${n} down` });
    up("Hero").focus();
    fireEvent.click(up("Hero"));
    expect(names(store)).toEqual(["Starter deck", "Hero", "Resources"]);
    expect(said()).toBe("Hero is now after Starter deck.");
    expect(document.activeElement).toBe(up("Hero"));
    fireEvent.click(up("Hero"));
    expect(names(store)).toEqual(["Hero", "Starter deck", "Resources"]);
    expect(said()).toBe("Hero is now first.");
    expect(document.activeElement).toBe(up("Hero"));
    // down: Hero passes Starter deck
    down("Hero").focus();
    fireEvent.click(down("Hero"));
    expect(names(store)).toEqual(["Starter deck", "Hero", "Resources"]);
    expect(said()).toBe("Hero is now after Starter deck.");
    expect(document.activeElement).toBe(down("Hero"));
    // the order is the plan's input: one undo step each
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(names(store)).toEqual(["Hero", "Starter deck", "Resources"]);
  });

  it("keeps the first item's Up and the last item's Down focusable, blocked, with the reason", () => {
    const { store } = renderApp({ project: kit() });
    openFromCard();
    const first = screen.getByRole("button", { name: "Move Starter deck up" });
    const last = screen.getByRole("button", { name: "Move Hero down" });
    for (const [button, words] of [
      [first, "Starter deck is already first."],
      [last, "Hero is already last."],
    ] as const) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(button.getAttribute("title")).toBe(words);
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      expect(names(store)).toEqual(["Starter deck", "Resources", "Hero"]);
      expect(said()).toBe(words);
      expect(document.activeElement).toBe(button);
    }
    expect(store.state.history.canUndo.value).toBe(false);
  });

  it("opens an item from its name; its back link reads the group's name and returns to the editor", () => {
    renderApp({ project: kit() });
    openFromCard();
    fireEvent.click(
      within(screen.getByRole("list", { name: "Order in the tray" })).getByRole("button", {
        name: "Resources",
      }),
    );
    // the item's editor stands in the rail, its back link names the group
    const back = within(rail()).getByRole("button", { name: "Player kit" });
    expect(within(rail()).queryByRole("button", { name: "What's inside" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Resources/);
    fireEvent.click(back);
    // back in the group's editor, with the focus on that item's name
    expect(within(rail()).getByRole("region", { name: "Player kit" })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Resources");
    // and Done from the group's editor goes on to the list
    fireEvent.click(within(rail()).getByRole("button", { name: "Done" }));
    expect(within(rail()).getByRole("button", { name: "Player kit, 4 copies" })).toBeTruthy();
  });
});

describe("Remove group…", () => {
  const ask = (): void => {
    openFromCard();
    fireEvent.click(screen.getByRole("button", { name: "Remove group…" }));
  };

  it("asks in place, naming what stays, and Cancel changes nothing", async () => {
    const { store } = renderApp({ project: kit() });
    ask();
    await later();
    expect(
      screen.getByText("Remove the group “Player kit”? Its 3 items stay, with 4 copies each."),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await later();
    expect(store.state.project.value.groups).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove group…" }));
  });

  it("is one undo step: each item has the group's copies, the card is gone, and the toast says so", () => {
    const { store } = renderApp({ project: kit() });
    ask();
    fireEvent.click(screen.getByRole("button", { name: "Remove group" }));
    const p = store.state.project.value;
    expect(p.groups ?? []).toHaveLength(0);
    expect(p.components.filter((c) => c.copies === 4).map((c) => c.name)).toEqual([
      "Starter deck",
      "Resources",
      "Hero",
    ]);
    // the list is back, the items stand in it as rows
    expect(within(rail()).queryByRole("group", { name: /Player kit/ })).toBeNull();
    expect(within(rail()).getByRole("button", { name: /^Starter deck, / })).toBeTruthy();
    expect(toast()).toBe("Player kit removed. Its items are back in the list. Undo removalDismiss");
    expect(document.querySelector('[data-live="removed"]')?.textContent).toBe(
      "Player kit removed. Its items are back in the list. Undo removal is available.",
    );
    // the focus is on an item of the removed group
    expect(document.activeElement).toBe(
      within(rail()).getByRole("button", { name: /^Starter deck, / }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(store.state.project.value.groups).toHaveLength(1);
    expect(store.state.project.value.components.every((c) => c.copies === undefined)).toBe(true);
    expect(screen.queryByRole("button", { name: "Undo removal" })).toBeNull();
    expect(store.state.history.canUndo.value).toBe(false);
  });

  it("says what its trays' pins lost, after its own note", () => {
    const base = kit();
    const { store } = renderApp({
      project: {
        ...base,
        locks: [
          { kind: "position", trayKey: "plrkit01:p0:0", path: "0", rotated: false },
          { kind: "position", trayKey: "plrkit01:p1:0", path: "1", rotated: false },
        ],
      },
    });
    ask();
    fireEvent.click(screen.getByRole("button", { name: "Remove group" }));
    expect(store.state.project.value.locks).toHaveLength(0);
    expect(toast()).toContain(
      "Player kit removed. Its items are back in the list. 2 pins removed.",
    );
  });

  it("asks without the copies when the group has one", () => {
    const base = kit();
    const group = base.groups?.[0];
    if (group === undefined) {
      throw new Error("the kit seed has a group");
    }
    renderApp({ project: { ...base, groups: [{ ...group, copies: 1 }] } });
    fireEvent.click(within(rail()).getByRole("button", { name: "Edit Player kit" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove group…" }));
    expect(screen.getByText("Remove the group “Player kit”? Its 3 items stay.")).toBeTruthy();
  });
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

describe("on a phone", () => {
  const sheet = (): HTMLElement =>
    screen.getByRole("region", { name: "The box and what's inside" });

  it("opens MobileEdit's sheet from the card's header: Back, the name as the h1, the strip, Done", () => {
    phone();
    renderApp({ project: kit() });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Show everything" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Edit Player kit" }));
    const panel = within(sheet()).getByRole("region", { name: "Edit Player kit" });
    expect(within(panel).getByRole("heading", { level: 1 }).textContent).toBe("Player kit");
    expect(within(panel).getByRole("button", { name: "Back" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Done" })).toBeTruthy();
    // the strip says which tray it is, as a line and not a heading
    expect(panel.querySelector(".ed-strip")?.textContent).toBe("Player kit, 4 trays.");
    expect(within(panel).getByRole("list", { name: "Order in the tray" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Extra room/);
    fireEvent.click(within(panel).getByRole("button", { name: "Back" }));
    expect(within(sheet()).getByRole("button", { name: "Player kit, 4 copies" })).toBeTruthy();
  });

  it("says '<n> compartments' in the dock of a group's tray, as on the desktop", () => {
    phone();
    renderApp({ project: kit() });
    const tile = document.querySelector('.plan-tile[data-key$=":p1:0"]') as HTMLElement;
    fireEvent.keyDown(tile, { key: "Enter" });
    const meta = document.querySelector(".tray-bar__meta")?.textContent ?? "";
    expect(meta).toMatch(/\b\d+ compartments$/);
    expect(meta).not.toMatch(/card well|scooped|figure pocket/);
  });
});
