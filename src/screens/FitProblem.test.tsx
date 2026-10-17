// @vitest-environment jsdom
// src/screens/FitProblem.test.tsx
// The fit problems as the app draws them (UI rebuild Task 12): a search that found no fit (NoFit,
// MobileFix) and pins that block a fit (PinConflict). The seeds are real runs: the stage is fed
// the result the way the runner leaves it.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../app/test-app";
import { loadSeed } from "../test-support/harbourKings";
import { misfitOf } from "../ui/noFit";
import { hoveredComponent } from "./hover";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  hoveredComponent.value = null;
});

/** The app on a seed, with what its failed run left (the seed's `.result.json`), as the runner would. */
function fitProblem(
  seed: string,
  tweak?: (r: NonNullable<ReturnType<typeof loadSeed>["result"]>) => void,
) {
  const { project, result } = loadSeed(seed);
  if (result === undefined) {
    throw new Error(`seed ${seed} has no result`);
  }
  const app = renderApp({ project });
  const run = structuredClone(result);
  tweak?.(run);
  act(() => {
    app.store.state.lastResult.value = run;
    app.store.state.lastResultHash.value = app.store.state.currentHash.value;
    app.store.state.lockConflicts.value = run.lockConflicts;
  });
  return { ...app, project, result: run };
}

/** A phone: the width query the app asks (below 760 px) answers yes. */
function phone(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(width < 760px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const h1 = (): HTMLElement => screen.getByRole("heading", { level: 1 });
const options = (): HTMLElement => document.querySelector('[data-region="options"]') as HTMLElement;
const names = (root: HTMLElement): (string | null)[] =>
  within(root)
    .getAllByRole("button")
    .map((b) => b.textContent);

const DENIED =
  /Lay the figures down|shallower|loose in one bin|any layer|Everything fits|Still doesn't fit|Best|needs \d+ mm|Unpin one and everything/;

describe("when it doesn't fit (NoFit)", () => {
  it("names the tray and the reason as a heading", () => {
    const { project, result } = fitProblem("harbour-kings-nofit");
    const misfit = misfitOf(result.bestAttempt, project.box, project.settings, project.components);
    expect(misfit?.name).toBe("Heroes");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1().textContent).toBe(`The ${misfit?.name} tray doesn't fit yet`);
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "There's no room left for it in the box.",
    );
    // the status is in the stage as a region of its own, in the warn tone
    expect(
      document.querySelector('[data-region="status"] .k-status')?.getAttribute("data-tone"),
    ).toBe("warn");
  });

  it("says the bed when no print bed orientation holds the tray", () => {
    fitProblem("harbour-kings-nofit-bed");
    expect(h1().textContent).toBe("The Heroes tray doesn't fit yet");
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "It's too big for your printer's bed.",
    );
  });

  it("falls back when no tray stands out", () => {
    fitProblem("harbour-kings-nofit", (r) => {
      // no tray overhangs and none is beyond the bed: misfitOf finds no one
      if (r.bestAttempt !== null) {
        r.bestAttempt = { trays: [], shortfall: { x: 0, y: 0, z: 5 } };
      }
    });
    expect(h1().textContent).toBe("Not everything fits yet");
    expect(document.querySelector(".k-status__line")).toBeNull();
    // nothing to edit: only the search is offered
    expect(names(options())).toEqual(["Keep searching"]);
  });

  it("offers only actions the engine can do", () => {
    fitProblem("harbour-kings-nofit");
    const panel = options();
    expect(
      within(panel).getByRole("heading", { level: 2, name: "Ways to make it fit" }),
    ).toBeTruthy();
    expect(names(panel)).toEqual(["Edit Heroes", "Keep searching"]);
    expect(document.querySelector('[data-region="stage"]')?.textContent).not.toMatch(DENIED);
  });

  it("leaves out Keep searching when the plan is from an older geometry", () => {
    const { project } = loadSeed("harbour-kings-nofit");
    const app = renderApp({
      project: {
        ...project,
        layout: project.layout && { ...project.layout, geometryVersion: "0.1.0" },
      },
    });
    const result = loadSeed("harbour-kings-nofit").result ?? null;
    act(() => {
      app.store.state.lastResult.value = result;
      app.store.state.lastResultHash.value = app.store.state.currentHash.value;
    });
    expect(names(options())).toEqual(["Edit Heroes"]);
  });

  it("opens the editor of the tray from its card", async () => {
    fitProblem("harbour-kings-nofit");
    fireEvent.click(within(options()).getByRole("button", { name: "Edit Heroes" }));
    expect(await screen.findByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("starts a longer search from Keep searching and hands the focus to Stop", async () => {
    const app = fitProblem("harbour-kings-nofit");
    const refit = vi.spyOn(app.store, "refit").mockImplementation(() => {
      act(() => {
        app.store.state.run.value = { status: "running", done: 0, total: 100, kind: "improve" };
      });
    });
    const keep = within(options()).getByRole("button", { name: "Keep searching" });
    keep.focus();
    fireEvent.click(keep);
    expect(refit).toHaveBeenCalledTimes(1);
    expect(h1().textContent).toBe("Searching for a better plan…");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stop" }));
  });

  it("gives the first card the ink edge, and no other", () => {
    fitProblem("harbour-kings-nofit");
    const cards = [...options().querySelectorAll(".fp-card")];
    expect(cards.map((c) => c.classList.contains("fp-card--lead"))).toEqual([true, false]);
  });

  it("hands the focus to the first card when a search ends on the same problem", () => {
    const app = fitProblem("harbour-kings-nofit");
    const keep = within(options()).getByRole("button", { name: "Keep searching" });
    vi.spyOn(app.store, "refit").mockImplementation(() => {
      act(() => {
        app.store.state.run.value = { status: "running", done: 0, total: 100, kind: "improve" };
      });
    });
    keep.focus();
    fireEvent.click(keep);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stop" }));
    // Stop goes with the run, and the focus would fall to the page
    act(() => {
      app.store.state.run.value = { status: "done" };
    });
    expect(document.activeElement).toBe(
      within(options()).getByRole("button", { name: "Edit Heroes" }),
    );
  });

  it("does not take the focus from where the person put it", () => {
    const app = fitProblem("harbour-kings-nofit");
    act(() => {
      app.store.state.run.value = { status: "running", done: 0, total: 100, kind: "improve" };
    });
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    act(() => {
      app.store.state.run.value = { status: "done" };
    });
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it("highlights the culprit in the list", () => {
    fitProblem("harbour-kings-nofit");
    const rail = document.querySelector('[data-region="rail"]') as HTMLElement;
    const row = within(rail).getByRole("button", { name: /^Heroes, / });
    expect(row.classList.contains("is-culprit")).toBe(true);
    expect(row.getAttribute("aria-label")).toBe("Heroes, Doesn't fit");
    expect(row.textContent).toContain("Doesn't fit");
    // only that row
    expect(rail.querySelectorAll(".is-culprit")).toHaveLength(1);
  });

  it("draws the closest attempt dimmed and marks the misfit tile", () => {
    fitProblem("harbour-kings-nofit");
    const box = document.querySelector('[data-region="plan-box"]') as HTMLElement;
    const marked = box.querySelectorAll(".plan-tile.is-misfit");
    expect(marked).toHaveLength(1);
    expect(marked[0]?.textContent).toBe("Heroes");
    // every other tile is dimmed, the marked one is not
    const tiles = [...box.querySelectorAll(".plan-tile")];
    expect(tiles.length).toBeGreaterThan(3);
    for (const tile of tiles) {
      expect(tile.classList.contains("is-dimmed")).toBe(!tile.classList.contains("is-misfit"));
    }
    // the caption is the plan's own
    expect(document.querySelector(".plan-caption")?.textContent).toMatch(/seen from above/);
  });

  it("is not interactive: no tile is a button, and a press selects nothing", () => {
    const app = fitProblem("harbour-kings-nofit");
    const box = document.querySelector('[data-region="plan-box"]') as HTMLElement;
    expect(within(box).queryAllByRole("button")).toHaveLength(0);
    expect(box.querySelectorAll("[tabindex]")).toHaveLength(0);
    const tile = box.querySelector(".plan-tile") as HTMLElement;
    fireEvent.pointerDown(tile, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(tile, { button: 0, pointerId: 1 });
    expect(app.store.state.selection.value).toBeNull();
    // no Layer or View switch and no tray bar
    expect(screen.queryByRole("group", { name: "Layer" })).toBeNull();
    expect(screen.queryByRole("group", { name: "View" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Selected tray" })).toBeNull();
  });

  it("blocks Download with its reason", () => {
    fitProblem("harbour-kings-nofit");
    const download = screen.getByRole("button", { name: "Fix the fit to download" });
    expect(download.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(download);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is gone when a plan fits again", () => {
    const app = fitProblem("harbour-kings-nofit");
    expect(options()).not.toBeNull();
    act(() => {
      app.store.state.lastResult.value = null;
    });
    expect(document.querySelector('[data-region="options"]')).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("when pins block a fit (PinConflict)", () => {
  it("names the pin and says why", () => {
    fitProblem("harbour-kings-pins");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1().textContent).toBe("Market deck doesn't fit with your pins");
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "The pins together leave no layout that fits.",
    );
  });

  it("offers one Unpin per conflicting pin, and no outcomes", () => {
    fitProblem("harbour-kings-pins");
    const column = options();
    expect(within(column).getByRole("heading", { level: 2, name: "Unpin one" })).toBeTruthy();
    expect(names(column)).toEqual([
      "Unpin Market deck",
      "Unpin Heroes",
      "Unpin Event cards",
      "Unpin Heroes and Event cards",
      "Undo",
    ]);
    expect(document.querySelector('[data-region="stage"]')?.textContent).not.toMatch(DENIED);
    // the conflict area (95 × 140 needed, 95 × 95 free) is not drawn
    expect(document.querySelector(".plan-box")?.textContent).not.toMatch(/mm/);
  });

  it("removes that pin, and only that one, in one undo step", () => {
    const app = fitProblem("harbour-kings-pins");
    const before = app.store.state.project.value.locks;
    expect(before).toHaveLength(4);
    fireEvent.click(within(options()).getByRole("button", { name: "Unpin Market deck" }));
    const after = app.store.state.project.value.locks;
    expect(after).toHaveLength(3);
    expect(after.some((l) => l.kind === "position" && l.trayKey === "market01:p0:0")).toBe(false);
    act(() => app.store.undo());
    expect(app.store.state.project.value.locks).toEqual(before);
  });

  it("draws the kept plan with the pinned trays whole and the rest dimmed, each pin badged", () => {
    fitProblem("harbour-kings-pins");
    const box = document.querySelector('[data-region="plan-box"]') as HTMLElement;
    const badges = box.querySelectorAll('.plan-badge[aria-label="Pinned"], .plan-badge');
    expect(badges.length).toBeGreaterThan(0);
    for (const tile of box.querySelectorAll(".plan-tile")) {
      const pinned = tile.classList.contains("is-locked");
      expect(tile.classList.contains("is-dimmed")).toBe(!pinned);
    }
    expect(box.querySelector(".is-misfit")).toBeNull();
    expect(within(box).queryAllByRole("button")).toHaveLength(0);
    // "Spacers fill the gaps again…" is the workspace's, not this screen's
    expect(document.querySelector(".plan-pins")).toBeNull();
  });

  it("keeps the rule chips, and lights the row of the tray the heading names", () => {
    fitProblem("harbour-kings-pins");
    const rail = document.querySelector('[data-region="rail"]') as HTMLElement;
    expect(within(rail).getByRole("button", { name: "Unpin Market deck" })).toBeTruthy();
    const row = within(rail).getByRole("button", { name: /^Market deck, / });
    expect(row.classList.contains("is-culprit")).toBe(true);
    expect(row.textContent).toContain("Doesn't fit");
    expect(rail.querySelectorAll(".is-culprit")).toHaveLength(1);
  });

  it("says a size lock in its own words", () => {
    fitProblem("harbour-kings-pins", (r) => {
      r.lockConflicts = [
        {
          trayKey: "market01:p0:0",
          kind: "size",
          name: "Market deck ×80",
          reason: "what it holds no longer fits that size",
        },
      ];
    });
    expect(h1().textContent).toBe("Market deck doesn't fit with its size locked");
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "What it holds no longer fits that size.",
    );
    expect(names(options())).toEqual(["Unlock size of Market deck", "Undo"]);
  });

  it("has an Undo that takes back the last change, and blocks it when there is none", () => {
    const app = fitProblem("harbour-kings-pins");
    const undo = within(options()).getByRole("button", { name: "Undo" });
    expect(undo.getAttribute("aria-disabled")).toBe("true");
    const p = app.store.state.project.value;
    act(() => {
      app.store.state.history.ensureBase(p);
      app.store.state.history.push({ ...p, name: "Changed" });
    });
    expect(
      within(options()).getByRole("button", { name: "Undo" }).getAttribute("aria-disabled"),
    ).toBe(null);
    fireEvent.click(within(options()).getByRole("button", { name: "Undo" }));
    expect(app.store.state.project.value.name).toBe(p.name);
  });

  it("blocks Download with its reason", () => {
    fitProblem("harbour-kings-pins");
    expect(
      screen.getByRole("button", { name: "Fix the fit to download" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});

describe("on a phone (MobileFix)", () => {
  function sheet(): HTMLElement {
    return document.querySelector('[data-region="sheet"]') as HTMLElement;
  }

  it("holds the ways to make it fit in a peek sheet under the heading and the attempt", () => {
    phone();
    fitProblem("harbour-kings-nofit");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1().textContent).toBe("The Heroes tray doesn't fit yet");
    expect(
      within(sheet()).getByRole("heading", { level: 2, name: "Ways to make it fit" }),
    ).toBeTruthy();
    const cards = within(sheet().querySelector(".fp-cards") as HTMLElement);
    expect(cards.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Edit Heroes",
      "Keep searching",
    ]);
    expect(sheet().getAttribute("data-peek")).toBe("true");
    // the attempt, with the misfit marked
    expect(document.querySelectorAll(".plan-tile.is-misfit")).toHaveLength(1);
    // the heading is not offering the fixes a second time
    const status = document.querySelector('[data-region="status"]') as HTMLElement;
    expect(within(status).queryAllByRole("button")).toHaveLength(0);
  });

  it("titles the sheet Unpin one for pins in the way", () => {
    phone();
    fitProblem("harbour-kings-pins");
    expect(within(sheet()).getByRole("heading", { level: 2, name: "Unpin one" })).toBeTruthy();
    const names = within(sheet().querySelector(".fp-cards") as HTMLElement)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names.slice(0, 2)).toEqual(["Unpin Market deck", "Unpin Heroes"]);
    expect(names.at(-1)).toBe("Undo");
  });

  it("keeps the list within reach under the cards", () => {
    phone();
    fitProblem("harbour-kings-nofit");
    expect(within(sheet()).getByRole("button", { name: /^The box/ })).toBeTruthy();
    const row = within(sheet()).getByRole("button", { name: /^Heroes, / });
    expect(row.classList.contains("is-culprit")).toBe(true);
  });

  it("blocks the Download icon with the reason as its title", () => {
    phone();
    fitProblem("harbour-kings-nofit");
    const download = screen.getByRole("button", { name: "Download" });
    expect(download.getAttribute("aria-disabled")).toBe("true");
    expect(download.getAttribute("title")).toBe("Fix the fit to download");
  });
});
