// src/screens/EditorStage.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../app/test-app";
import { makeTray } from "../app/test-helpers";
import { newComponent } from "../model/defaults";
import type { CardsComponent, Component, Group, TraySpec } from "../model/types";
import { describeOptionChange } from "../ui/components/optionNotes";
import { loadSeed } from "../test-support/harbourKings";
import { EditorStage, EditorStrip, GroupSentence, StageSentence } from "./EditorStage";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const editMarket = (): void => {
  const rail = screen.getByRole("complementary", { name: "What's inside" });
  fireEvent.click(within(rail).getByRole("button", { name: /^Market deck, / }));
};
const stage = (): HTMLElement => document.querySelector('[data-region="stage"]') as HTMLElement;
const tile = (key: string): HTMLElement =>
  document.querySelector(`.plan-tile[data-key="${key}"]`) as HTMLElement;

describe("EditorStage", () => {
  it("says which tray it is editing", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    editMarket();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(
      /^Market deck tray, \d+(\.\d)? × \d+(\.\d)? mm\. It grows as you add cards\.$/,
    );
    // the name is in bold, as Edit has it
    expect(h1.querySelector("strong")?.textContent).toBe("Market deck");
    // the slot is the board's 52 px one, and the stage holds no status heading beside it
    expect(within(stage()).getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("lifts the edited tray and dims the rest", () => {
    const { project } = loadSeed("harbour-kings");
    renderApp({ project });
    editMarket();
    const keys = [...document.querySelectorAll<HTMLElement>(".plan-tile[data-key]")].map(
      (t) => t.dataset.key as string,
    );
    const market = keys.filter((k) => k.startsWith("market01:"));
    const others = keys.filter((k) => !k.startsWith("market01:"));
    expect(market.length).toBeGreaterThan(0);
    for (const key of market) {
      expect(tile(key).classList.contains("is-lifted"), key).toBe(true);
      expect(tile(key).classList.contains("is-dimmed"), key).toBe(false);
    }
    for (const key of others) {
      expect(tile(key).classList.contains("is-lifted"), key).toBe(false);
      expect(tile(key).classList.contains("is-dimmed"), key).toBe(true);
    }
  });

  it("shows the layer the component is on, so its lift is in sight", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    // the seed's Heroes are on the bottom layer, the cards above: open one from the top layer
    const rail = screen.getByRole("complementary", { name: "What's inside" });
    fireEvent.click(within(rail).getByRole("button", { name: /^Event cards, / }));
    const lifted = document.querySelector(".plan-tile.is-lifted");
    expect(lifted).not.toBeNull();
  });

  describe("the Layer switch", () => {
    const layerGroup = (): HTMLElement => within(stage()).getByRole("group", { name: "Layer" });
    const pressed = (): string[] =>
      within(layerGroup())
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent ?? "");
    const shownKeys = (): string[] =>
      [...document.querySelectorAll<HTMLElement>(".plan-tile[data-key]")].map(
        (t) => t.dataset.key as string,
      );
    const open = (name: RegExp): void => {
      const rail = screen.getByRole("complementary", { name: "What's inside" });
      fireEvent.click(within(rail).getByRole("button", { name }));
    };

    it("is in the slot beside the sentence, one group, with the layers' names", () => {
      renderApp({ project: loadSeed("harbour-kings").project });
      editMarket();
      const slot = stage().querySelector(".ed-slot__row") as HTMLElement;
      expect(slot.contains(layerGroup())).toBe(true);
      expect(screen.getAllByRole("group", { name: "Layer" })).toHaveLength(1);
      expect(
        within(layerGroup())
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Layer 1 (bottom)", "Layer 2 (top)"]);
      expect(within(layerGroup()).queryByText("All")).toBeNull();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("opens on the layer of the item's first tray, and the other layer shows when picked", () => {
      const { project } = loadSeed("harbour-kings");
      renderApp({ project });
      editMarket();
      const trays = project.layout?.trays ?? [];
      const level = (key: string): number => trays.find((t) => t.key === key)?.level ?? -1;
      const first = trays.find((t) => t.key.startsWith("market01:"));
      expect(first).toBeDefined();
      const home = first?.level ?? 0;
      expect(pressed()).toEqual([home === 0 ? "Layer 1 (bottom)" : "Layer 2 (top)"]);
      expect(shownKeys().every((k) => level(k) === home)).toBe(true);
      expect(document.querySelector(".plan-tile.is-lifted")).not.toBeNull();
      // the other layer: its trays are drawn, and the item's are not on it
      fireEvent.click(
        within(layerGroup()).getByRole("button", {
          name: home === 0 ? "Layer 2 (top)" : "Layer 1 (bottom)",
        }),
      );
      expect(shownKeys().length).toBeGreaterThan(0);
      expect(shownKeys().every((k) => level(k) !== home)).toBe(true);
      expect(shownKeys().some((k) => k.startsWith("market01:"))).toBe(false);
      expect(document.querySelector(".plan-tile.is-lifted")).toBeNull();
    });

    it("opens another item on its own layer, whatever layer was looked at before", () => {
      const { project } = loadSeed("harbour-kings");
      renderApp({ project });
      editMarket();
      const before = pressed()[0];
      fireEvent.click(
        within(layerGroup()).getByRole("button", {
          name: before === "Layer 1 (bottom)" ? "Layer 2 (top)" : "Layer 1 (bottom)",
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      open(/^Event cards, /);
      const event = (project.layout?.trays ?? []).find((t) => t.key.startsWith("event"));
      const expected = event?.level === 0 ? "Layer 1 (bottom)" : "Layer 2 (top)";
      expect(pressed()).toEqual([expected]);
      expect(document.querySelector(".plan-tile.is-lifted")).not.toBeNull();
    });

    it("is not there for a plan of one layer", () => {
      const { project } = loadSeed("harbour-kings");
      const one = (project.layout?.trays ?? []).map((t) => ({ ...t, level: 0 }));
      renderApp({
        project: { ...project, layout: project.layout && { ...project.layout, trays: one } },
      });
      editMarket();
      expect(screen.queryByRole("group", { name: "Layer" })).toBeNull();
    });
  });

  it("shows an option change as a note in the slot, in place of the h1", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { project } = loadSeed("harbour-kings");
    renderApp({ project });
    editMarket();
    const market = project.components.find((c) => c.name === "Market deck") as CardsComponent;
    const said = describeOptionChange(market, { ...market, sleeve: "premium" });
    expect(said).not.toBeNull();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Sleeves" })).getByRole("button", {
        name: "Premium",
      }),
    );
    const note = within(stage())
      .getAllByRole("status")
      .find((el) => el.textContent === said);
    expect(note, "the note is in a status region of the stage").toBeTruthy();
    // it takes the sentence's place on screen, and the page keeps its h1 (hidden) meanwhile
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.classList.contains("visually-hidden")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(within(stage()).queryByText(said as string)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).classList.contains("visually-hidden")).toBe(
      false,
    );
  });

  it("goes back to the workspace's status heading when the editor closes", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    editMarket();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Everything fits");
    expect(document.querySelector(".plan-tile.is-lifted")).toBeNull();
  });

  it("lets a tray be looked at but not picked while its editor is open", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    editMarket();
    const other = document.querySelector<HTMLElement>(
      ".plan-tile[data-key]:not([data-key^='market01:'])",
    ) as HTMLElement;
    fireEvent.keyDown(other, { key: "Enter" });
    expect(screen.queryByRole("region", { name: "Selected tray" })).toBeNull();
  });
});

describe("what the plan says while an editor is open", () => {
  const alertIn = (): HTMLElement => {
    const alert = within(stage())
      .getAllByRole("alert")
      .find((el) => el.classList.contains("ed-problem"));
    if (alert === undefined) {
      throw new Error("no problem line in the stage");
    }
    return alert;
  };

  it("tells a failed run in the heading's words, with Retry, and keeps the sentence as the h1", () => {
    const { store } = renderApp({ project: loadSeed("harbour-kings").project });
    editMarket();
    act(() => {
      store.state.run.value = { status: "error", message: "Worker crashed" };
    });
    const alert = alertIn();
    expect(alert.tagName).toBe("P");
    expect(alert.textContent).toContain("The plan couldn't be updated");
    expect(alert.textContent).toContain("Worker crashed.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Market deck tray/);
    const retry = vi.spyOn(store, "retry");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("tells a tray that does not fit", () => {
    const seed = loadSeed("harbour-kings-nofit");
    const { store } = renderApp({ project: seed.project });
    editMarket();
    act(() => {
      store.state.lastResult.value = seed.result ?? null;
      store.state.lastResultHash.value = store.state.currentHash.value;
      store.state.lockConflicts.value = seed.result?.lockConflicts ?? [];
    });
    expect(alertIn().textContent).toMatch(/tray doesn't fit yet|Not everything fits yet/);
    expect(within(alertIn()).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("tells the pins in the way", () => {
    const seed = loadSeed("harbour-kings-pins");
    const { store } = renderApp({ project: seed.project });
    editMarket();
    act(() => {
      store.state.lastResult.value = seed.result ?? null;
      store.state.lastResultHash.value = store.state.currentHash.value;
      store.state.lockConflicts.value = seed.result?.lockConflicts ?? [];
    });
    expect(alertIn().textContent).toMatch(/doesn't fit with (your pins|its size locked)/);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("says nothing of a plan that is fine, or of errors that the editor marks itself", () => {
    const { store } = renderApp({ project: loadSeed("harbour-kings").project });
    editMarket();
    expect(document.querySelector(".ed-problem")).toBeNull();
    act(() => {
      store.edit((q) => ({
        ...q,
        components: q.components.map((c) =>
          c.kind === "cards" && c.name === "Market deck"
            ? { ...c, decks: [{ name: "x", count: -1 }] }
            : c,
        ),
      }));
    });
    expect(document.querySelector(".ed-problem")).toBeNull();
  });
});

describe("StageSentence", () => {
  const cards = (over: Partial<CardsComponent> = {}): CardsComponent => ({
    ...(newComponent("cards") as CardsComponent),
    id: "c1",
    name: "Market deck",
    ...over,
  });
  const tray = (over: Partial<TraySpec> = {}): TraySpec => makeTray({ w: 95, d: 190, ...over });

  it("gives the size, and that a deck grows", () => {
    render(<StageSentence component={cards()} trays={[tray()]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Market deck tray, 95 × 190 mm. It grows as you add cards.",
    );
  });

  it("says nothing of growing for a deck that does not, or for another kind", () => {
    render(<StageSentence component={cards({ growth: { stack: "off" } })} trays={[tray()]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Market deck tray, 95 × 190 mm.",
    );
    cleanup();
    const tiles: Component = {
      ...(newComponent("tiles") as Component),
      id: "t",
      name: "Hex tiles",
    };
    render(<StageSentence component={tiles} trays={[tray()]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Hex tiles tray, 95 × 190 mm.",
    );
  });

  it("counts the trays when there are several", () => {
    render(
      <StageSentence
        component={cards({ name: "Starter decks" })}
        trays={[tray({ key: "a" }), tray({ key: "b" }), tray({ key: "c" })]}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Starter decks, 3 trays.");
  });

  it("adds that the tray is split when a copy had to be printed as several trays", () => {
    const keys = (...ks: string[]) => ks.map((key) => tray({ key }));
    render(
      <StageSentence
        component={cards({ name: "Player kit" })}
        trays={keys("kit:p0:0", "kit:p0:1")}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Player kit, 2 trays. Too big for one tray, so it is split.",
    );
    cleanup();
    render(
      <StageSentence
        component={cards({ name: "Player kit" })}
        trays={keys("kit:p0:0", "kit:p0:1", "kit:p1:0", "kit:p1:1")}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Player kit, 4 trays. Too big for one tray, so it is split.",
    );
  });

  it("does not say split of several copies, each one tray", () => {
    render(
      <StageSentence
        component={cards({ name: "Player kit" })}
        trays={["kit:p0:0", "kit:p1:0", "kit:p2:0", "kit:p3:0"].map((key) => tray({ key }))}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Player kit, 4 trays.");
  });

  it("is the name alone while there is no plan, and names an unnamed one", () => {
    render(<StageSentence component={cards()} trays={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Market deck");
    cleanup();
    render(<StageSentence component={cards({ name: "" })} trays={[]} tag="p" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("(unnamed)")).toBeTruthy();
  });
});

describe("EditorStrip", () => {
  it("draws the box small and says the sentence, as a line and not a heading", () => {
    const { project } = loadSeed("harbour-kings");
    const layout = project.layout;
    if (layout === undefined) {
      throw new Error("the seed has no plan");
    }
    const market = project.components.find((c) => c.name === "Market deck") as Component;
    render(
      <EditorStrip
        componentId={market.id}
        components={project.components}
        trays={layout.trays}
        box={project.box}
        settings={project.settings}
        note={null}
        onNoteDone={() => undefined}
      />,
    );
    const picture = document.querySelector(".ed-strip__box") as HTMLElement;
    expect(picture.getAttribute("aria-hidden")).toBe("true");
    expect(picture.querySelectorAll("[data-edited]").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(/^tray, .* mm\./).closest("p")?.textContent).toMatch(
      /^Market deck tray/,
    );
  });

  it("says the note in its place, and goes back to the sentence when it is done", () => {
    vi.useFakeTimers();
    const { project } = loadSeed("harbour-kings");
    const done = vi.fn();
    const market = project.components[0] as Component;
    render(
      <EditorStrip
        componentId={market.id}
        components={project.components}
        trays={project.layout?.trays ?? []}
        box={project.box}
        settings={project.settings}
        note={{ text: "Finger cuts added.", id: 1 }}
        onNoteDone={done}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Finger cuts added.");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("a group's stage (G2)", () => {
  const kit: Group = {
    id: "kit",
    name: "Player kit",
    copies: 4,
    access: "often",
    memberIds: ["c1", "c2"],
  };
  const members = [
    { ...newComponent("cards"), id: "c1", name: "Starter deck" },
    { ...newComponent("minis"), id: "c2", name: "Hero" },
  ] as Component[];
  const trayOf = (key: string, level = 0, over: Partial<TraySpec> = {}): TraySpec => {
    const base = makeTray({ key, level });
    const well = base.compartments[0];
    return {
      ...base,
      compartments: members.map((c) => ({
        ...(well as NonNullable<typeof well>),
        componentId: c.id,
        contents: c.name,
      })),
      ...over,
    };
  };

  it("says the group's name and how many trays, with the name in bold, as the page's h1", () => {
    render(
      <GroupSentence
        group={kit}
        trays={["kit:p0:0", "kit:p1:0", "kit:p2:0", "kit:p3:0"].map((key) => trayOf(key))}
      />,
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Player kit, 4 trays.");
    expect(h1.querySelector("strong")?.textContent).toBe("Player kit");
  });

  it("gives one tray's size, adds that a copy is split, and is the name alone without a plan", () => {
    const { rerender } = render(<GroupSentence group={kit} trays={[trayOf("kit:p0:0")]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Player kit tray, 100 × 80 mm.",
    );
    rerender(
      <GroupSentence
        group={{ ...kit, copies: 1 }}
        trays={[trayOf("kit:p0:0"), trayOf("kit:p0:1")]}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Player kit, 2 trays. Too big for one tray, so it is split.",
    );
    rerender(<GroupSentence group={{ ...kit, name: "" }} trays={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Group");
  });

  it("takes its trays from the plan by their key, and the sentence of the stage counts them", () => {
    render(
      <EditorStage
        groupId="kit"
        components={members}
        groups={[kit]}
        trays={[
          trayOf("kit:p0:0"),
          trayOf("kit:p1:0"),
          makeTray({ key: "other:p0:0" }),
          trayOf("kit:p1:0:spacer", 0, { part: "spacer", compartments: [] }),
        ]}
        note={null}
        onNoteDone={() => undefined}
        plan={null}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Player kit, 2 trays.");
  });

  it("has the Layer switch as the item editor has it: it opens on the group's layer and moves the view", () => {
    render(
      <EditorStage
        groupId="kit"
        components={members}
        groups={[kit]}
        trays={[
          makeTray({ key: "other:p0:0", level: 0 }),
          trayOf("kit:p0:0", 1),
          trayOf("kit:p1:0", 1),
        ]}
        note={null}
        onNoteDone={() => undefined}
        plan={null}
      />,
    );
    const layers = screen.getByRole("group", { name: "Layer" });
    const pressed = (): string[] =>
      within(layers)
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent ?? "");
    // the group is on the second layer, and the box opens there
    expect(pressed()).toEqual(["Layer 2 (top)"]);
    fireEvent.click(within(layers).getByRole("button", { name: "Layer 1 (bottom)" }));
    expect(pressed()).toEqual(["Layer 1 (bottom)"]);
  });

  it("draws the strip for a phone with the group's trays edited", () => {
    const { project } = loadSeed("harbour-kings-kit");
    render(
      <EditorStrip
        groupId="plrkit01"
        components={project.components}
        groups={project.groups}
        trays={project.layout?.trays ?? []}
        box={project.box}
        settings={project.settings}
        note={null}
        onNoteDone={() => undefined}
      />,
    );
    expect(document.querySelectorAll(".ed-strip__box [data-edited]")).toHaveLength(4);
    expect(screen.getByText(/^, 4 trays\./).closest("p")?.textContent).toBe("Player kit, 4 trays.");
  });
});
