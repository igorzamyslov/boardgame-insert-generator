// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import kit from "../kit/kit.css?raw";
import css from "./trayBar.css?raw";
import { toggleLock, turnTray } from "../app/actions";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { inputsHash } from "../model/hash";
import type { Lock, Project, TraySpec } from "../model/types";
import { shadeOf } from "./identity";
import { TrayBar } from "./TrayBar";
import type { TrayBarProps } from "./TrayBar";

afterEach(cleanup);

const KEY = "fxcrd003:p0:0";

/** A project with a plan of the given trays (a tall box, so trays can stack). */
function planned(trays: TraySpec[], locks: Lock[] = []): Project {
  const base = fixtureProject();
  const p = { ...base, locks, box: { ...base.box, innerHeight: 200 } };
  return { ...p, layout: makeLayout(inputsHash(p), trays) };
}

const tray = (over: Partial<TraySpec> = {}): TraySpec =>
  makeTray({ key: KEY, w: 72, d: 96, ...over });

/** Meshes for the filament line: every part is a 72 × 96 × 40 mm box, 40 % of it plastic. */
function stubMeshes(): MeshSource {
  return {
    get: vi.fn(() =>
      Promise.resolve({ mesh: cubeMesh([72, 96, 40]), volumeMm3: 72 * 96 * 40 * 0.4 }),
    ),
    reset: vi.fn(),
    forget: vi.fn(),
    dispose: vi.fn(),
  };
}

/** The meta line once the filament has been counted. */
const counted = (el: Element | null): Promise<void> =>
  waitFor(() => expect(el?.textContent).toMatch(/ · about \d+ g$/));

function props(over: Partial<TrayBarProps> = {}): TrayBarProps {
  const t = over.tray ?? tray();
  return {
    project: planned([t]),
    tray: t,
    name: "Region deck",
    layer: "Layer 1",
    meshes: stubMeshes(),
    onPin: vi.fn(),
    onTurn: vi.fn(),
    onSwap: vi.fn(),
    onPutOn: vi.fn(),
    onToggleSizeLock: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

function bar(over: Partial<TrayBarProps> = {}) {
  const p = props(over);
  return { p, view: render(<TrayBar {...p} />) };
}

const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });
/** An entry of the ⋯ menu: its name leads, the line that says what it does follows. */
const entry = (name: string): HTMLElement =>
  screen.getByRole("button", { name: new RegExp(`^${name}`) });
const lineOf = (el: HTMLElement): string | undefined =>
  el.querySelector(".tray-more__line")?.textContent ?? undefined;
const openMore = (): HTMLElement => {
  const more = button("More about this tray");
  fireEvent.click(more);
  return more;
};
const closed = (): boolean =>
  screen.queryByRole("group", { name: "More about this tray" }) === null;
const region = (): HTMLElement => screen.getByRole("region", { name: "Selected tray" });
const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of every rule that has exactly this selector (alone or in a list), joined. */
function ruleFor(selector: string, source = strip(css)): string {
  let out = "";
  for (const [, selectors = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(",").some((one) => one.trim() === selector)) {
      out += body;
    }
  }
  return out;
}

describe("TrayBar", () => {
  it("is a region named Selected tray, marked for the screenshots", () => {
    bar();
    expect(region().getAttribute("data-region")).toBe("tray-bar");
    expect(screen.queryByRole("group", { name: "Selected tray" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has Edit as its one action, then ⋯ and Close", () => {
    bar({ onEdit: vi.fn() });
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Edit", "More about this tray", "Close"]);
    expect(button("Edit").classList.contains("tray-bar__edit")).toBe(true);
    expect(region().querySelector(".tray-bar__why")).toBeNull();
  });

  it("keeps the menu shut until ⋯ is pressed, and shuts it on a second press", () => {
    bar();
    const more = button("More about this tray");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(closed()).toBe(true);
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(closed()).toBe(false);
    fireEvent.click(more);
    expect(closed()).toBe(true);
  });

  it("lists Keep here, Rotate 90°, Swap places with…, Put on… and Keep this size, each with its line", () => {
    bar();
    openMore();
    const panel = screen.getByRole("group", { name: "More about this tray" });
    expect(panel.closest(".tray-more__panel")).not.toBeNull();
    const items = [...panel.querySelectorAll<HTMLElement>("button")];
    expect(items.map((b) => b.querySelector("span")?.textContent)).toEqual([
      "Keep here",
      "Rotate 90°",
      "Swap places with…",
      "Put on…",
      "Keep this size",
    ]);
    expect(items.map(lineOf)).toEqual([
      "The plan will not move it",
      "Stays free to move",
      "Then pick the other tray",
      "Stands it on another tray",
      "The plan will not resize it",
    ]);
    // the line is part of each entry's name
    expect(entry("Keep here").textContent).toContain("The plan will not move it");
  });

  it("closes the menu on Escape without clearing the selection, and puts the focus back on ⋯", () => {
    const onKey = vi.fn();
    const { view } = bar();
    view.container.addEventListener("keydown", onKey);
    const more = openMore();
    const stop = fireEvent.keyDown(entry("Keep this size"), { key: "Escape" });
    expect(stop).toBe(false);
    expect(closed()).toBe(true);
    expect(onKey).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(more);
  });

  it("ends a swap on Escape, whoever has the focus in the dock", () => {
    const onSwap = vi.fn();
    bar({ swapping: true, onSwap });
    expect(fireEvent.keyDown(entry("Swap places with…"), { key: "Escape" })).toBe(false);
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it("ends a put-on on Escape too", () => {
    const onPutOn = vi.fn();
    bar({ puttingOn: true, onPutOn });
    expect(
      fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "Escape" }),
    ).toBe(false);
    expect(onPutOn).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on a click outside it", () => {
    bar();
    openMore();
    fireEvent.click(document.body);
    expect(closed()).toBe(true);
  });

  it("starts a swap, shows it under way with the menu open, and shuts the menu with it", () => {
    const { p, view } = bar();
    openMore();
    const swap = entry("Swap places with…");
    expect(swap.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(swap);
    expect(p.onSwap).toHaveBeenCalledTimes(1);
    // the swap began: the menu stays open on the pressed item, whatever pressed it
    view.rerender(<TrayBar {...p} swapping />);
    expect(button("More about this tray").getAttribute("aria-expanded")).toBe("true");
    expect(entry("Swap places with…").getAttribute("aria-pressed")).toBe("true");
    // …and shuts with it
    view.rerender(<TrayBar {...p} />);
    expect(closed()).toBe(true);
  });

  it("opens the menu at once for a swap that is already under way", () => {
    bar({ swapping: true });
    expect(entry("Swap places with…").getAttribute("aria-pressed")).toBe("true");
  });

  it("Put on… starts a put-on, shows it pressed, and closes the menu", () => {
    const { p, view } = bar();
    openMore();
    expect(entry("Put on…").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(entry("Put on…"));
    expect(p.onPutOn).toHaveBeenCalledTimes(1);
    expect(closed()).toBe(true);
    view.rerender(<TrayBar {...p} puttingOn />);
    openMore();
    expect(entry("Put on…").getAttribute("aria-pressed")).toBe("true");
  });

  it("Keep here toggles to Unpin, with the effect said the other way", () => {
    const { p, view } = bar();
    openMore();
    const keep = entry("Keep here");
    expect(keep.getAttribute("aria-pressed")).toBe("false");
    expect(lineOf(keep)).toBe("The plan will not move it");
    fireEvent.click(keep);
    expect(p.onPin).toHaveBeenCalledTimes(1);
    const locks: Lock[] = [{ kind: "position", trayKey: KEY, path: "0", rotated: false }];
    view.rerender(<TrayBar {...p} project={planned([p.tray], locks)} />);
    const unpin = entry("Unpin");
    expect(unpin.getAttribute("aria-pressed")).toBe("true");
    expect(unpin.classList.contains("is-on")).toBe(true);
    expect(lineOf(unpin)).toBe("The plan may move it again");
    expect(screen.queryByRole("button", { name: /^Keep here/ })).toBeNull();
    // a pinned tray stays turned as it is kept
    expect(lineOf(entry("Rotate 90°"))).toBe("Stays where it is kept");
  });

  it("says Pinned in the live region, not in a chip", () => {
    const locks: Lock[] = [{ kind: "position", trayKey: KEY, path: "0", rotated: false }];
    bar({ project: planned([tray()], locks) });
    const live = region().querySelector("[aria-live]") as HTMLElement;
    expect(live.classList.contains("visually-hidden")).toBe(true);
    expect(within(live).getByText("Pinned")).toBeTruthy();
  });

  it("says Pinned, turned for a pin that turned the tray", () => {
    // Turn alone doesn't pin: it is the Turn of a pinned tray that writes a turned pin.
    const base = planned([tray()]);
    const turned = turnTray(toggleLock(base, tray()), tray());
    bar({ project: turned });
    expect(screen.getByText("Pinned, turned")).toBeTruthy();
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("says Turned for a tray that was turned and not pinned, and the menu still offers Keep here", () => {
    const base = planned([tray()]);
    const turned = turnTray(base, tray());
    expect(turned.locks).toEqual([{ kind: "turn", trayKey: KEY, rotated: true }]);
    bar({ project: turned });
    expect(screen.getByText("Turned")).toBeTruthy();
    expect(screen.queryByText("Pinned, turned")).toBeNull();
    expect(screen.queryByText("Pinned")).toBeNull();
    openMore();
    expect(entry("Keep here").getAttribute("aria-pressed")).toBe("false");
  });

  it("says Pinned, not Turned, for a pin that is not turned, even with a turn lock under it", () => {
    const locks: Lock[] = [
      { kind: "position", trayKey: KEY, path: "0", rotated: false },
      { kind: "turn", trayKey: KEY, rotated: false },
    ];
    bar({ project: planned([tray()], locks) });
    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(screen.queryByText("Turned")).toBeNull();
  });

  it("says what Keep here holds: a tray alone, or the stack it is in, with how many trays", () => {
    const low = tray({ key: "fxcrd002:p0:1", path: "10", level: 0 });
    const mid = tray({ key: "fxcrd002:p0:2", path: "10", level: 1, z: 20 });
    const high = tray({ key: "fxcrd002:p0:0", path: "10", level: 2, z: 40 });
    const { p, view } = bar({ project: planned([low, mid, high]), tray: mid });
    openMore();
    expect(lineOf(entry("Keep here"))).toBe("The plan will not move these 3 trays");
    fireEvent.click(entry("Keep here"));
    expect(p.onPin).toHaveBeenCalledTimes(1);
    // pinned: the same words, the other way
    const locks: Lock[] = [low, mid, high].map((t) => ({
      kind: "position",
      trayKey: t.key,
      path: "10",
      rotated: false,
    }));
    view.rerender(<TrayBar {...p} project={planned([low, mid, high], locks)} />);
    expect(lineOf(entry("Unpin"))).toBe("The plan may move these 3 trays again");
    view.unmount();
    // a tray of a stack of one reads as a tray alone
    bar({ project: planned([tray()]) });
    openMore();
    expect(lineOf(entry("Keep here"))).toBe("The plan will not move it");
  });

  it("says Size locked in the live region once locked", () => {
    const locks: Lock[] = [{ kind: "size", trayKey: KEY, w: 72, d: 96, h: 40 }];
    bar({ project: planned([tray()], locks) });
    expect(screen.getByText("Size locked")).toBeTruthy();
  });

  it("Keep this size toggles to Let the size change, and closes the menu", () => {
    const { p, view } = bar();
    openMore();
    const keep = entry("Keep this size");
    expect(keep.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(keep);
    expect(p.onToggleSizeLock).toHaveBeenCalledTimes(1);
    expect(closed()).toBe(true);
    const locks: Lock[] = [{ kind: "size", trayKey: KEY, w: 72, d: 96, h: 40 }];
    view.rerender(<TrayBar {...p} project={planned([p.tray], locks)} />);
    openMore();
    const change = entry("Let the size change");
    expect(change.classList.contains("is-on")).toBe(true);
    expect(lineOf(change)).toBe("The plan may resize it");
    expect(screen.queryByRole("button", { name: /^Keep this size/ })).toBeNull();
  });

  it("shows a dot on ⋯ while the tray is pinned or its size is locked, with its name unchanged", () => {
    const { p, view } = bar();
    const dot = (): Element | null =>
      button("More about this tray").querySelector(".k-iconbtn__dot");
    expect(dot()).toBeNull();
    const pin: Lock[] = [{ kind: "position", trayKey: KEY, path: "0", rotated: false }];
    view.rerender(<TrayBar {...p} project={planned([p.tray], pin)} />);
    expect(dot()?.getAttribute("aria-hidden")).toBe("true");
    const size: Lock[] = [{ kind: "size", trayKey: KEY, w: 72, d: 96, h: 40 }];
    view.rerender(<TrayBar {...p} project={planned([p.tray], size)} />);
    expect(dot()).not.toBeNull();
    expect(button("More about this tray")).toBeTruthy();
  });

  it("reads the meta from the layout, and the filament once the part is built", async () => {
    bar();
    const meta = region().querySelector(".tray-bar__meta");
    expect(meta?.textContent).toBe("Layer 1 · 72 × 96 × 40 mm");
    await counted(meta);
    expect(meta?.textContent).toMatch(/^Layer \d · \d+ × \d+ × \d+ mm · about \d+ g$/);
    expect(meta?.textContent).not.toMatch(/ h| min/);
    expect(region().textContent).not.toMatch(/#\d/);
  });

  it("gives no filament without meshes, or when the part cannot be built", async () => {
    bar({ meshes: undefined });
    await Promise.resolve();
    expect(region().querySelector(".tray-bar__meta")?.textContent).toBe(
      "Layer 1 · 72 × 96 × 40 mm",
    );
    cleanup();
    const failing = stubMeshes();
    vi.mocked(failing.get).mockImplementation(() => Promise.reject(new Error("no")));
    bar({ meshes: failing });
    await waitFor(() => expect(failing.get).toHaveBeenCalled());
    await Promise.resolve();
    expect(region().querySelector(".tray-bar__meta")?.textContent).toBe(
      "Layer 1 · 72 × 96 × 40 mm",
    );
  });

  it("names the tray in full in its title, on one line", () => {
    const long = "Heroes, with a name that goes on and on, and then on some more";
    bar({ name: long });
    const name = region().querySelector(".tray-bar__name");
    expect(name?.textContent).toBe(long);
    expect(name?.getAttribute("title")).toBe(long);
  });

  it("keeps a long name on one line", () => {
    expect(ruleFor(".tray-bar__name")).toMatch(/white-space:\s*nowrap/);
    expect(ruleFor(".tray-bar__name")).toMatch(/text-overflow:\s*ellipsis/);
    expect(ruleFor(".tray-bar__meta")).toMatch(/white-space:\s*nowrap/);
    expect(ruleFor(".tray-bar__meta")).toMatch(/text-overflow:\s*ellipsis/);
    expect(ruleFor(".tray-bar__text")).toMatch(/min-width:\s*0/);
  });

  it("gives a spacer only Close", () => {
    const spacer = tray({ key: "spacer:0", part: "spacer", compartments: [] });
    bar({ tray: spacer, project: planned([spacer]), name: "Spacer" });
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Close"]);
    expect(region().querySelector(".tray-bar__meta")?.textContent).toMatch(
      /^Fills the gap so the trays can't slide\. Print it too\. 72 × 96 × 40 mm$/,
    );
    expect(
      region().querySelector(".tray-bar__swatch")?.classList.contains("tray-bar__swatch--spacer"),
    ).toBe(true);
  });

  it("gives a spare tray the same", () => {
    const spare = tray({ key: "leftover:0", part: "leftover", compartments: [] });
    bar({ tray: spare, project: planned([spare]), name: "Spacer" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(region().textContent).toMatch(/Fills the gap so the trays can't slide/);
  });

  it("says what a riser carries, and its size", () => {
    const riser = tray({ key: "a:p0:0:riser", part: "riser", compartments: [] });
    bar({ tray: riser, project: planned([riser]), name: "Riser", carries: "Region deck" });
    expect(region().querySelector(".tray-bar__meta")?.textContent).toBe(
      "Carries Region deck · 72 × 96 × 40 mm",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("says nothing of a merged part's pieces: it is a spacer that prints as one", () => {
    const filler = makeTray({ key: "leftover:0", part: "leftover", solid: true, compartments: [] });
    const merged = makeTray({
      key: "merged:0",
      part: "leftover",
      solid: true,
      compartments: [],
      merged: { members: [filler], bridges: [], flipped: true },
    });
    bar({ tray: merged, project: planned([merged]), name: "Spacer" });
    expect(screen.queryByText("Joins")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("never offers another layer", () => {
    bar({ onEdit: vi.fn() });
    openMore();
    for (const b of screen.getAllByRole("button")) {
      expect(b.textContent ?? "").not.toMatch(/layer$/i);
    }
    expect(screen.queryByText(/other layer|top layer|bottom layer/i)).toBeNull();
  });

  it("Rotate 90° asks to turn, and is offered while nothing is in the way", () => {
    const { p } = bar();
    openMore();
    const turn = entry("Rotate 90°");
    expect(turn.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(turn);
    expect(p.onTurn).toHaveBeenCalledTimes(1);
  });

  it("Rotate 90° says why it is unavailable for a square tray, and does nothing", () => {
    const { p } = bar({ tray: tray({ w: 80, d: 80.3 }) });
    openMore();
    const turn = entry("Rotate 90°");
    expect(turn.getAttribute("aria-disabled")).toBe("true");
    expect(turn.hasAttribute("disabled")).toBe(false);
    const reason = "This tray is square, so turning changes nothing.";
    expect(screen.getByText(reason)).toBeTruthy();
    const described = document.getElementById(turn.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe(reason);
    fireEvent.click(turn);
    expect(p.onTurn).not.toHaveBeenCalled();
  });

  it("gives canTurn's reason when the pins a turn flips clash with a size lock", () => {
    const low = tray({ key: "fxcrd002:p0:1", path: "10", level: 0 });
    const high = tray({ key: "fxcrd002:p0:0", path: "10", level: 1, z: 20 });
    // a pinned stack turns as one, so a size lock that only fits its tray as it is stands in the way
    const pins: Lock[] = [low, high].map((t) => ({
      kind: "position",
      trayKey: t.key,
      path: "10",
      rotated: false,
    }));
    const project = planned(
      [low, high],
      [
        ...pins,
        { kind: "stack", trayKeys: [low.key, high.key] },
        { kind: "size", trayKey: high.key, w: 74, d: 98, h: 75 },
      ],
    );
    bar({ project, tray: low });
    openMore();
    expect(entry("Rotate 90°").getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByText(/^Turning doesn't work for .+: it conflicts with the size lock/),
    ).toBeTruthy();
  });

  it("offers Edit for a tray that holds a component, and Close always", () => {
    const onEdit = vi.fn();
    const { p, view } = bar({ onEdit });
    fireEvent.click(button("Edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(button("Close"));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    view.rerender(<TrayBar {...p} onEdit={undefined} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("announces only the pin, turn and size lock, not the buttons or the sizes", () => {
    bar({ onEdit: vi.fn(), tray: tray({ w: 80, d: 80 }) });
    const live = [...document.querySelectorAll("[aria-live]")];
    expect(live).toHaveLength(1);
    expect(live[0]?.classList.contains("visually-hidden")).toBe(true);
    expect(region().hasAttribute("aria-live")).toBe(false);
    expect(live[0]?.querySelector("button, dl")).toBeNull();
  });

  it("keeps every control at 44 px: the kit's buttons, and no height of its own on the bar's", () => {
    expect(strip(kit)).toMatch(/\.k-btn\s*{[^}]*height:\s*var\(--control-h\)/);
    expect(strip(kit)).toMatch(/\.k-iconbtn\s*{[^}]*height:\s*var\(--control-h\)/);
    expect(ruleFor(".tray-bar .tray-bar__edit")).not.toMatch(/height/);
    expect(strip(css)).not.toMatch(/\.tray-bar[^{]*\.k-(btn|iconbtn)[^{]*{[^}]*height/);
  });
});

describe("TrayBar for a group's tray (G1)", () => {
  const groupLook = { kind: "cards" as const, shade: shadeOf("group", 0), group: true };
  const cells = [
    { shade: shadeOf("cards", 0) },
    { shade: shadeOf("bulk", 0) },
    { shade: shadeOf("minis", 0) },
  ];
  const kit = (over: Partial<TrayBarProps> = {}) =>
    bar({
      name: "Player kit 2",
      look: groupLook,
      cells,
      compartments: "5 compartments",
      layerCount: 1,
      onEdit: vi.fn(),
      ...over,
    });

  it("draws the swatch as a tiny tray: a neutral tile with a cell per member, in order", () => {
    kit();
    const swatch = region().querySelector(".tray-bar__swatch") as HTMLElement;
    expect(swatch.classList.contains("tray-bar__swatch--group")).toBe(true);
    const spans = [...swatch.querySelectorAll<HTMLElement>(".tray-bar__cell")];
    expect(spans).toHaveLength(3);
    expect(spans.map((c) => c.style.getPropertyValue("--cell-own-fill"))).toEqual(
      cells.map((c) => c.shade.fill),
    );
    expect(spans.map((c) => c.style.getPropertyValue("--cell-own-line"))).toEqual(
      cells.map((c) => c.shade.line),
    );
    // G1 draws near-equal bars: no cell is sized by its compartments
    expect(swatch.style.gridTemplateColumns).toBe("1fr 1fr 1fr");
    // the tile itself is the group's neutral, not a kind's
    expect(region().style.getPropertyValue("--shade-fill")).toBe(groupLook.shade.fill);
  });

  it("styles the tiny tray from the page's tokens: a 2 px line, the cell's own colours", () => {
    const rule = ruleFor(".tray-bar__swatch--group");
    expect(rule).toMatch(/display:\s*grid/);
    expect(rule).toMatch(/gap:\s*2px/);
    expect(rule).toMatch(/padding:\s*3px/);
    expect(ruleFor(".tray-bar__swatch")).toMatch(/border:\s*2px solid var\(--shade-line/);
    expect(ruleFor(".tray-bar__cell")).toMatch(/background:\s*var\(--cell-own-fill/);
    expect(ruleFor(".tray-bar__cell")).toMatch(
      /box-shadow:\s*inset 0 0 0 1px var\(--cell-own-line/,
    );
  });

  it("says the size, the compartments and the filament", async () => {
    kit();
    await counted(region().querySelector(".tray-bar__meta"));
    const meta = region().querySelector(".tray-bar__meta")?.textContent ?? "";
    expect(meta).toMatch(/^72 × 96 × 40 mm · 5 compartments · about \d+ g$/);
  });

  it("puts the layer first only when the plan has two", async () => {
    kit({ layerCount: 2 });
    await counted(region().querySelector(".tray-bar__meta"));
    expect(region().querySelector(".tray-bar__meta")?.textContent).toMatch(
      /^Layer 1 · 72 × 96 × 40 mm · 5 compartments · about /,
    );
  });

  it("opens the group's editor with Edit", () => {
    const { p } = kit();
    fireEvent.click(button("Edit"));
    expect(p.onEdit).toHaveBeenCalledTimes(1);
  });

  it("keeps Edit, ⋯ and Close, as for any tray", () => {
    kit();
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Edit", "More about this tray", "Close"]);
  });
});
