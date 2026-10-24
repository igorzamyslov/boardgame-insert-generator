// @vitest-environment jsdom
// src/screens/FitProblem.test.tsx
// The fit problems as the app draws them: a search that found no fit (the problem strip over the
// normal stage, board 6 of the 2026-10-23 review) and pins that block a fit (PinConflict, UI
// rebuild Task 12). The seeds are real runs: the stage is fed the result the way the runner leaves it.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../app/test-app";
import type { Project } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import type { LockConflict } from "../layout/types";
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
  tweakProject?: (p: Project) => Project,
) {
  const seeded = loadSeed(seed);
  const result = seeded.result;
  if (result === undefined) {
    throw new Error(`seed ${seed} has no result`);
  }
  const project = tweakProject === undefined ? seeded.project : tweakProject(seeded.project);
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
/** No fit: the pinned strip, and its two buttons. */
const strip = (): HTMLElement => document.querySelector(".stage-fit") as HTMLElement;
const stripActions = (): HTMLElement => strip().querySelector(".fit-strip__actions") as HTMLElement;
const names = (root: HTMLElement): (string | null)[] =>
  within(root)
    .getAllByRole("button")
    .map((b) => b.textContent);

const DENIED =
  /Lay the figures down|shallower|loose in one bin|any layer|Everything fits|Still doesn't fit|Best|needs \d+ mm|Unpin one and everything/;

describe("when it doesn't fit (the strip)", () => {
  it("names the tray and the reason as a heading", () => {
    const { project, result } = fitProblem("harbour-kings-nofit");
    const misfit = misfitOf(result.bestAttempt, project.box, project.settings, project.components);
    expect(misfit?.name).toBe("Heroes");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1().textContent).toBe(`The ${misfit?.name} tray doesn't fit yet`);
    // the engine's whole-plan shortfall (13.7 mm in height) is the one figure
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "There's no room left for it in the box. The closest plan is 13.7 mm too tall.",
    );
    // the status is in the stage as a region of its own, in the warn tone
    expect(
      document.querySelector('[data-region="status"] .k-status')?.getAttribute("data-tone"),
    ).toBe("warn");
  });

  it("says how much room the items need against the box, under the buttons", () => {
    fitProblem("harbour-kings-nofit");
    expect(strip().querySelector(".fit-strip__volume")?.textContent).toBe(
      "Your items need at least 1.9 L as trays. The box has 5.6 L.",
    );
    // the buttons come first
    expect(strip().querySelector(".fit-strip__actions + .fit-strip__volume")).not.toBeNull();
  });

  it("says very tight beside the figures when the items nearly fill the box", () => {
    // 170 × 170 × 70: 2.0 L of box for 1.9 L of trays
    fitProblem("harbour-kings-nofit", undefined, (p) => ({
      ...p,
      box: { ...p.box, innerWidth: 170, innerDepth: 170 },
    }));
    expect(strip().querySelector(".fit-strip__line")?.textContent).toMatch(
      /^Your items need at least 1\.9 L as trays\. The box has 2\.\d L\. Very tight: expect to change settings\.$/,
    );
    expect(h1().textContent).toMatch(/tray doesn't fit yet$/);
  });

  it("blames no tray when the items need more than the box has, and says so in the heading", () => {
    // 150 × 150 × 70: 1.6 L of box for 1.9 L of trays
    fitProblem("harbour-kings-nofit", undefined, (p) => ({
      ...p,
      box: { ...p.box, innerWidth: 150, innerDepth: 150 },
    }));
    expect(h1().textContent).toBe("Not everything fits yet");
    expect(document.querySelector(".k-status__line")?.textContent).toMatch(
      /^Your items need at least 1\.9 L as trays\. The box has 1\.\d L\. This can't fit: take something out\.$/,
    );
    expect(names(stripActions())).toEqual(["Try another arrangement"]);
    // the biggest items, so it is clear what to leave out, behind "What takes the room"
    expect(strip().querySelector(".fit-strip__more summary")?.textContent).toBe(
      "What takes the room",
    );
    expect(strip().querySelector(".fit-strip__more ul")?.textContent).toMatch(
      /Heroes takes 0\.6 L/,
    );
    expect(document.querySelector("[data-misfit]")).toBeNull();
  });

  it("says the bed when no print bed orientation holds the tray", () => {
    fitProblem("harbour-kings-nofit-bed");
    expect(h1().textContent).toBe("The Heroes tray doesn't fit yet");
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "It's too big for your printer's bed.",
    );
  });

  it("names every axis that is short, the largest first, rounded up", () => {
    fitProblem("harbour-kings-nofit", (r) => {
      if (r.bestAttempt !== null) {
        r.bestAttempt.shortfall = { x: 2.951, y: 0, z: 17.2 };
      }
    });
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "There's no room left for it in the box. The closest plan is 17.2 mm too tall and 3.0 mm too wide.",
    );
  });

  it("names a shortfall in length, and says nothing of one that is not there", () => {
    fitProblem("harbour-kings-nofit", (r) => {
      if (r.bestAttempt !== null) {
        r.bestAttempt.shortfall = { x: 0, y: 4, z: 0 };
      }
    });
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "There's no room left for it in the box. The closest plan is 4.0 mm too long.",
    );
    cleanup();
    fitProblem("harbour-kings-nofit", (r) => {
      if (r.bestAttempt !== null) {
        r.bestAttempt.shortfall = { x: 0, y: 0, z: 0.01 };
      }
    });
    expect(document.querySelector(".k-status__line")?.textContent).toMatch(/0\.1 mm too tall/);
  });

  it("does not repeat the engine's no-fit paragraph, and keeps the other notices", () => {
    fitProblem("harbour-kings-nofit");
    const stage = document.querySelector('[data-region="stage"]') as HTMLElement;
    expect(stage.textContent).not.toMatch(/No fit found yet|iterations without finding/);
    expect(stage.querySelector(".stage-notes")).toBeNull();
    cleanup();
    fitProblem("harbour-kings-nofit", (r) => {
      r.notices = [
        ...r.notices,
        { level: "warning", code: "layout.play", message: "Trays can shift 1.60 mm." },
      ];
    });
    expect(document.querySelector('[data-region="stage"]')?.textContent).toContain(
      "Trays can shift 1.60 mm.",
    );
    expect(document.querySelector('[data-region="stage"]')?.textContent).not.toMatch(
      /No fit found yet/,
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
    // no tray to blame, but the plan's shortfall is still the one figure
    expect(document.querySelector(".k-status__line")?.textContent).toBe(
      "The closest plan is 5.0 mm too tall.",
    );
    // nothing to edit: only the search is offered
    expect(names(stripActions())).toEqual(["Try another arrangement"]);
  });

  it("offers only actions the engine can do, in the status row", () => {
    fitProblem("harbour-kings-nofit");
    expect(names(stripActions())).toEqual(["Edit Heroes", "Try another arrangement"]);
    // the strip is the status row itself: the h1 is in it, and there is no panel of its own
    expect(strip().getAttribute("data-region")).toBe("status");
    expect(strip().contains(h1())).toBe(true);
    expect(document.querySelector('[data-region="options"]')).toBeNull();
    expect(document.querySelector('[data-region="stage"]')?.textContent).not.toMatch(DENIED);
  });

  it("leaves out Try another arrangement when the plan is from an older geometry", () => {
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
    expect(names(stripActions())).toEqual(["Edit Heroes"]);
  });

  it("opens the editor of the tray from its card", async () => {
    fitProblem("harbour-kings-nofit");
    fireEvent.click(within(stripActions()).getByRole("button", { name: "Edit Heroes" }));
    expect(await screen.findByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("starts a longer search from Try another arrangement and hands the focus to Stop", async () => {
    const app = fitProblem("harbour-kings-nofit");
    const refit = vi.spyOn(app.store, "refit").mockImplementation(() => {
      act(() => {
        app.store.state.run.value = { status: "running", done: 0, total: 100, kind: "improve" };
      });
    });
    const keep = within(stripActions()).getByRole("button", { name: "Try another arrangement" });
    keep.focus();
    fireEvent.click(keep);
    expect(refit).toHaveBeenCalledTimes(1);
    expect(h1().textContent).toBe("Searching…");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stop" }));
  });

  it("makes Edit the primary button, and Try another arrangement the secondary", () => {
    fitProblem("harbour-kings-nofit");
    const [edit, keep] = [...stripActions().querySelectorAll("button")];
    expect(edit?.classList.contains("k-btn--primary")).toBe(true);
    expect(keep?.classList.contains("k-btn--secondary")).toBe(true);
  });

  it("hands the focus to Edit when a search ends on the same problem", () => {
    const app = fitProblem("harbour-kings-nofit");
    const keep = within(stripActions()).getByRole("button", { name: "Try another arrangement" });
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
      within(stripActions()).getByRole("button", { name: "Edit Heroes" }),
    );
  });

  it("takes the focus without scrolling the stage, so the heading and the plan's top stay in view", () => {
    const app = fitProblem("harbour-kings-nofit");
    const keep = within(stripActions()).getByRole("button", { name: "Try another arrangement" });
    vi.spyOn(app.store, "refit").mockImplementation(() => {
      act(() => {
        app.store.state.run.value = { status: "running", done: 0, total: 100, kind: "improve" };
      });
    });
    keep.focus();
    fireEvent.click(keep);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    act(() => {
      app.store.state.run.value = { status: "done" };
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
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

  it("draws no tile as a control, and a press selects nothing", () => {
    const app = fitProblem("harbour-kings-nofit");
    const box = document.querySelector('[data-region="plan-box"]') as HTMLElement;
    expect(within(box).queryAllByRole("button")).toHaveLength(0);
    expect(box.querySelectorAll("[tabindex]")).toHaveLength(0);
    const tile = box.querySelector(".plan-tile") as HTMLElement;
    fireEvent.pointerDown(tile, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(tile, { button: 0, pointerId: 1 });
    expect(app.store.state.selection.value).toBeNull();
    // the Layer and View switches are the normal stage's, in the same places; there is no tray bar
    expect(screen.getByRole("group", { name: "Layer" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "View" })).toBeTruthy();
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
    expect(strip()).not.toBeNull();
    act(() => {
      app.store.state.lastResult.value = null;
    });
    expect(document.querySelector(".stage-fit")).toBeNull();
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
      "Unpin Coins and cubes",
      "Unpin Heroes and Coins and cubes",
    ]);
    // the header's Undo is the way back: the column has none of its own
    expect(within(column).queryByRole("button", { name: "Undo" })).toBeNull();
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

  it("keeps the rule chips, and lights the row of every tray with a pin in the way", () => {
    fitProblem("harbour-kings-pins");
    const rail = document.querySelector('[data-region="rail"]') as HTMLElement;
    expect(within(rail).getByRole("button", { name: "Unpin Market deck" })).toBeTruthy();
    const lit = [...rail.querySelectorAll(".is-culprit")].map((r) => r.getAttribute("aria-label"));
    expect(lit).toEqual([
      "Market deck, Doesn't fit",
      "Coins and cubes, Doesn't fit",
      "Heroes, Doesn't fit",
    ]);
    // a row with no pin in the way is not lit
    expect(
      within(rail)
        .getByRole("button", { name: /^Starter decks, / })
        .classList.contains("is-culprit"),
    ).toBe(false);
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
    expect(names(options())).toEqual(["Unlock size of Market deck"]);
  });

  it("unlocks the size from its card, and only the size", () => {
    const lock = { kind: "size" as const, trayKey: "market01:p0:0", w: 95, d: 190, h: 40 };
    const app = fitProblem(
      "harbour-kings-pins",
      (r) => {
        r.lockConflicts = [
          { trayKey: "market01:p0:0", kind: "size", name: "Market deck ×80", reason: "no room" },
        ];
      },
      (p) => ({ ...p, locks: [...p.locks, lock] }),
    );
    const before = app.store.state.project.value.locks;
    expect(before).toHaveLength(5);
    fireEvent.click(within(options()).getByRole("button", { name: "Unlock size of Market deck" }));
    const after = app.store.state.project.value.locks;
    expect(after.some((l) => l.kind === "size")).toBe(false);
    expect(after).toHaveLength(4);
    expect(after.filter((l) => l.kind === "position")).toHaveLength(3);
    act(() => app.store.undo());
    expect(app.store.state.project.value.locks).toEqual(before);
  });

  /** A card's run: it begins, then ends with the conflicts the run left. */
  function runLeaves(app: ReturnType<typeof fitProblem>, conflicts: LockConflict[]) {
    act(() => {
      // the edit scheduled a run; the run begins, and the schedule is over
      app.store.state.runScheduled.value = false;
      app.store.state.run.value = { status: "running", done: 0, total: 100, kind: "edit" };
    });
    act(() => {
      app.store.state.lockConflicts.value = conflicts;
      app.store.state.run.value = { status: "done" };
    });
  }

  it("hands the focus to Download when an Unpin resolved the conflict", () => {
    const app = fitProblem("harbour-kings-pins");
    const card = within(options()).getByRole("button", { name: "Unpin Market deck" });
    card.focus();
    fireEvent.click(card);
    expect(document.activeElement).toBe(document.body);
    runLeaves(app, []);
    expect(document.querySelector('[data-region="options"]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Download/ }));
  });

  it("hands the focus to the first card when the Unpin left a conflict", () => {
    const app = fitProblem("harbour-kings-pins");
    const left = app.store.state.lockConflicts.value.slice(1);
    const card = within(options()).getByRole("button", { name: "Unpin Market deck" });
    card.focus();
    fireEvent.click(card);
    runLeaves(app, left);
    expect(document.activeElement).toBe(within(options()).getAllByRole("button")[0]);
  });

  it("does not move the focus to Download for a run that no fit problem began", () => {
    const { project } = loadSeed("harbour-kings");
    const app = renderApp({ project });
    act(() => {
      app.store.state.run.value = { status: "running", done: 0, total: 100, kind: "edit" };
    });
    act(() => {
      app.store.state.run.value = { status: "done" };
    });
    expect(document.activeElement).toBe(document.body);
  });

  it("does not hand the focus to Stop when Try another arrangement starts no search", () => {
    const app = fitProblem("harbour-kings-nofit");
    vi.spyOn(app.store, "refit").mockImplementation(() => undefined);
    fireEvent.click(
      within(stripActions()).getByRole("button", { name: "Try another arrangement" }),
    );
    // a later run that the person did not ask for must not pull the focus to its Stop
    act(() => {
      app.store.state.run.value = { status: "running", done: 0, total: 100, kind: "edit" };
    });
    expect(document.activeElement).toBe(document.body);
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

  it("pins the strip over the attempt, and leaves the sheet the list", () => {
    phone();
    fitProblem("harbour-kings-nofit");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1().textContent).toBe("The Heroes tray doesn't fit yet");
    expect(names(stripActions())).toEqual(["Edit Heroes", "Try another arrangement"]);
    // the sheet is the list again: no cards, no "Ways to make it fit"
    expect(
      within(sheet()).queryByRole("heading", { level: 2, name: "Ways to make it fit" }),
    ).toBeNull();
    expect(sheet().querySelector(".fp-cards")).toBeNull();
    // the attempt, with the misfit marked
    expect(document.querySelectorAll(".plan-tile.is-misfit")).toHaveLength(1);
  });

  it("folds the volume note behind one line, so the pinned strip leaves the plan its room", () => {
    phone();
    fitProblem("harbour-kings-nofit");
    const more = strip().querySelector("details.fit-strip__more") as HTMLElement;
    expect(more.querySelector("summary")?.textContent).toBe("What the items need");
    expect(more.textContent).toContain("Your items need at least 1.9 L as trays.");
    expect(strip().querySelector(":scope > .fit-strip__volume > .fit-strip__line")).toBeNull();
  });

  it("titles the sheet Unpin one for pins in the way", () => {
    phone();
    fitProblem("harbour-kings-pins");
    expect(within(sheet()).getByRole("heading", { level: 2, name: "Unpin one" })).toBeTruthy();
    const names = within(sheet().querySelector(".fp-cards") as HTMLElement)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual([
      "Unpin Market deck",
      "Unpin Heroes",
      "Unpin Coins and cubes",
      "Unpin Heroes and Coins and cubes",
    ]);
  });

  it("keeps the list in the sheet, the culprit's row marked", () => {
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
