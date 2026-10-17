// src/screens/EditorStage.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../app/test-app";
import { makeTray } from "../app/test-helpers";
import { newComponent } from "../model/defaults";
import type { CardsComponent, Component, TraySpec } from "../model/types";
import { describeOptionChange } from "../ui/components/optionNotes";
import { loadSeed } from "../test-support/harbourKings";
import { EditorStrip, StageSentence } from "./EditorStage";

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
    // it replaces the sentence while it shows
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(within(stage()).queryByText(said as string)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
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
