// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import kit from "../kit/kit.css?raw";
import tokens from "../styles/tokens.css?raw";
import css from "./trayBar.css?raw";
import { turnTray } from "../app/actions";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { inputsHash } from "../model/hash";
import type { Lock, Project, TraySpec } from "../model/types";
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

function props(over: Partial<TrayBarProps> = {}): TrayBarProps {
  const t = over.tray ?? tray();
  return {
    project: planned([t]),
    tray: t,
    name: "Region deck",
    layer: "Layer 1 (bottom)",
    onPin: vi.fn(),
    onTurn: vi.fn(),
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

/** The bar's own children, as a person sees them: not the hidden reasons, not the line that says why. */
const visibleChildren = (el: HTMLElement): Element[] =>
  [...el.children].filter(
    (c) => !c.classList.contains("visually-hidden") && !c.classList.contains("tray-bar__why"),
  );

describe("TrayBar", () => {
  it("is a region named Selected tray, marked for the screenshots", () => {
    bar();
    expect(region().getAttribute("data-region")).toBe("tray-bar");
    expect(screen.queryByRole("group", { name: "Selected tray" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps name, meta and actions in one wrapping row", () => {
    bar({ onEdit: vi.fn(), onSwap: vi.fn() });
    const [swatch, text, ...actions] = visibleChildren(region());
    expect(swatch?.getAttribute("aria-hidden")).toBe("true");
    expect(text?.textContent).toMatch(/^Region deck/);
    expect(
      actions.map(
        (a) => (a.matches("button") ? a : (a.querySelector("button") as Element)).textContent,
      ),
    ).toEqual(["Pin", "Turn 90°", "Edit", "More", ""]);
    // Close is the last, named by its label
    expect(actions.at(-1)?.getAttribute("aria-label")).toBe("Close");
    expect(ruleFor(".tray-bar")).toMatch(/flex-wrap:\s*wrap/);
  });

  it("hides Swap with… and Lock size behind More", () => {
    bar({ onSwap: vi.fn() });
    expect(screen.queryByRole("button", { name: "Swap with…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lock size" })).toBeNull();
    const more = button("More");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(button("Swap with…").getAttribute("aria-pressed")).toBe("false");
    expect(button("Lock size").hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(more);
    expect(screen.queryByRole("button", { name: "Lock size" })).toBeNull();
  });

  it("closes More on Escape without clearing the selection, and puts the focus back on More", () => {
    const onKey = vi.fn();
    const { view } = bar();
    view.container.addEventListener("keydown", onKey);
    const more = button("More");
    fireEvent.click(more);
    const lock = button("Lock size");
    const stop = fireEvent.keyDown(lock, { key: "Escape" });
    expect(stop).toBe(false);
    expect(screen.queryByRole("button", { name: "Lock size" })).toBeNull();
    expect(onKey).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(more);
  });

  it("leaves Escape to the plan while a swap is chosen: it ends the swap", () => {
    const onKey = vi.fn();
    const { view } = bar({ onSwap: vi.fn(), swapping: true });
    view.container.addEventListener("keydown", onKey);
    expect(fireEvent.keyDown(button("Swap with…"), { key: "Escape" })).toBe(true);
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it("closes More on a click outside it", () => {
    bar();
    fireEvent.click(button("More"));
    fireEvent.click(document.body);
    expect(screen.queryByRole("button", { name: "Lock size" })).toBeNull();
  });

  it("offers Swap with… only where a swap can be made, and shows it under way with More open", () => {
    const { p, view } = bar();
    fireEvent.click(button("More"));
    expect(screen.queryByRole("button", { name: "Swap with…" })).toBeNull();
    const onSwap = vi.fn();
    view.rerender(<TrayBar {...p} onSwap={onSwap} />);
    const swap = button("Swap with…");
    expect(swap.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(swap);
    expect(onSwap).toHaveBeenCalledTimes(1);
    // The swap began: the menu stays open on the pressed item, whatever pressed it
    view.rerender(<TrayBar {...p} onSwap={onSwap} swapping />);
    expect(button("More").getAttribute("aria-expanded")).toBe("true");
    expect(button("Swap with…").getAttribute("aria-pressed")).toBe("true");
    // …and shuts with it
    view.rerender(<TrayBar {...p} onSwap={onSwap} />);
    expect(screen.queryByRole("button", { name: "Swap with…" })).toBeNull();
  });

  it("opens More at once for a swap that is already under way", () => {
    bar({ onSwap: vi.fn(), swapping: true });
    expect(button("Swap with…").getAttribute("aria-pressed")).toBe("true");
  });

  it("Lock size toggles, says Unlock size once locked, and closes the menu", () => {
    const { p, view } = bar();
    fireEvent.click(button("More"));
    const lock = button("Lock size");
    expect(lock.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(lock);
    expect(p.onToggleSizeLock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Lock size" })).toBeNull();
    const locks: Lock[] = [{ kind: "size", trayKey: KEY, w: 72, d: 96, h: 40 }];
    view.rerender(<TrayBar {...p} project={planned([p.tray], locks)} />);
    fireEvent.click(button("More"));
    expect(button("Unlock size").hasAttribute("aria-pressed")).toBe(false);
    expect(button("Unlock size").classList.contains("is-on")).toBe(true);
  });

  it("reads the meta from the layout", () => {
    bar();
    const meta = region().querySelector(".tray-bar__meta");
    expect(meta?.textContent).toMatch(
      /^Layer \d \((bottom|top)\) · \d+ × \d+ × \d+ mm · about [\d.]+ (h|min), \d+ g$/,
    );
    expect(meta?.textContent).toBe(
      `Layer 1 (bottom) · 72 × 96 × 40 mm · ${/about .+/.exec(meta?.textContent ?? "")?.[0]}`,
    );
    expect(region().textContent).not.toMatch(/#\d/);
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

  it("draws Main's bar: 18 px radius, the sheet, a rule line, the bar's shadow, 8 px gaps", () => {
    const rule = ruleFor(".tray-bar");
    expect(rule).toMatch(/border-radius:\s*var\(--r-bar\)/);
    expect(rule).toMatch(/background:\s*var\(--sheet\)/);
    expect(rule).toMatch(/border:\s*1px solid var\(--rule\)/);
    expect(rule).toMatch(/box-shadow:\s*var\(--shadow-bar\)/);
    expect(rule).toMatch(/gap:\s*var\(--s-8\)/);
    expect(rule).toMatch(/padding:\s*var\(--s-8\) var\(--s-8\) var\(--s-8\) var\(--s-12\)/);
    expect(ruleFor(".tray-bar__text")).toMatch(/flex:\s*1 1 200px/);
    expect(ruleFor(".tray-bar__swatch")).toMatch(/width:\s*30px/);
  });

  it("gives a spacer only Close", () => {
    const spacer = tray({ key: "spacer:0", part: "spacer", compartments: [] });
    bar({ tray: spacer, project: planned([spacer]), name: "Spacer", onSwap: vi.fn() });
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
    bar({ onEdit: vi.fn(), onSwap: vi.fn() });
    fireEvent.click(button("More"));
    for (const b of screen.getAllByRole("button")) {
      expect(b.textContent ?? "").not.toMatch(/layer$/i);
    }
    expect(screen.queryByText(/other layer|top layer|bottom layer/i)).toBeNull();
  });

  it("Pin toggles to Unpin, and the pin is told in the live region, not in a chip", () => {
    const { p, view } = bar();
    const pin = button("Pin");
    // The label is the action: no aria-pressed to say it twice.
    expect(pin.hasAttribute("aria-pressed")).toBe(false);
    expect(pin.getAttribute("data-on")).toBeNull();
    fireEvent.click(pin);
    expect(p.onPin).toHaveBeenCalledTimes(1);
    const locks: Lock[] = [{ kind: "position", trayKey: KEY, path: "0", rotated: false }];
    view.rerender(<TrayBar {...p} project={planned([p.tray], locks)} />);
    expect(button("Unpin").hasAttribute("aria-pressed")).toBe(false);
    expect(button("Unpin").getAttribute("data-on")).toBe("true");
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    const live = region().querySelector("[aria-live]") as HTMLElement;
    expect(live.classList.contains("visually-hidden")).toBe(true);
    expect(within(live).getByText("Pinned")).toBeTruthy();
  });

  it("says Pinned, turned for a pin that turned the tray", () => {
    const base = planned([tray()]);
    const turned = turnTray(base, tray());
    bar({ project: turned });
    expect(screen.getByText("Pinned, turned")).toBeTruthy();
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("says Size locked in the live region once locked", () => {
    const locks: Lock[] = [{ kind: "size", trayKey: KEY, w: 72, d: 96, h: 40 }];
    bar({ project: planned([tray()], locks) });
    expect(screen.getByText("Size locked")).toBeTruthy();
  });

  it("Turn 90° asks to turn, and is offered while nothing is in the way", () => {
    const { p } = bar();
    const turn = button("Turn 90°");
    expect(turn.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(turn);
    expect(p.onTurn).toHaveBeenCalledTimes(1);
    expect(region().querySelector(".tray-bar__why")?.textContent).toBe("");
  });

  it("Turn says why it is unavailable for a square tray, on a line of its own", () => {
    const { p } = bar({ tray: tray({ w: 80, d: 80.3 }) });
    const turn = button("Turn 90°");
    expect(turn.getAttribute("aria-disabled")).toBe("true");
    expect(turn.hasAttribute("disabled")).toBe(false);
    const reason = "This tray is square, so turning changes nothing.";
    // the line everybody sees, and the sentence the button is described by
    expect(region().querySelector(".tray-bar__why")?.textContent).toBe(reason);
    const described = document.getElementById(turn.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe(reason);
    fireEvent.click(turn);
    expect(p.onTurn).not.toHaveBeenCalled();
    expect(ruleFor(".tray-bar__why")).toMatch(/flex-basis:\s*100%/);
    expect(ruleFor(".tray-bar__why")).toMatch(/color:\s*var\(--warn-ink\)/);
    expect(ruleFor(".tray-bar__why")).toMatch(/font-size:\s*var\(--text-xs\)/);
  });

  it("gives canTurn's reason when the pins a turn writes clash with a size lock", () => {
    const low = tray({ key: "fxcrd002:p0:1", path: "10", level: 0 });
    const high = tray({ key: "fxcrd002:p0:0", path: "10", level: 1, z: 20 });
    const project = planned(
      [low, high],
      [{ kind: "size", trayKey: high.key, w: 150, d: 150, h: 90 }],
    );
    bar({ project, tray: low });
    expect(button("Turn 90°").getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByText(/^Turning doesn't work for .+: it conflicts with the size lock/, {
        selector: ".tray-bar__why p",
      }),
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

  it("announces only the pin and size lock and the reason, not the buttons or the sizes", () => {
    bar({ onEdit: vi.fn(), onSwap: vi.fn(), tray: tray({ w: 80, d: 80 }) });
    const live = [...document.querySelectorAll("[aria-live]")];
    expect(live).toHaveLength(2);
    expect(live[0]?.classList.contains("visually-hidden")).toBe(true);
    expect(live[1]?.classList.contains("tray-bar__why")).toBe(true);
    expect(live[1]?.textContent).toMatch(/square/);
    expect(region().hasAttribute("aria-live")).toBe(false);
    for (const el of live) {
      expect(el.querySelector("button, dl")).toBeNull();
    }
  });

  it("keeps every control at 44 px: the kit's buttons, and no height of its own on the bar's", () => {
    expect(strip(kit)).toMatch(/\.k-btn\s*{[^}]*height:\s*var\(--control-h\)/);
    expect(strip(kit)).toMatch(/\.k-iconbtn\s*{[^}]*height:\s*var\(--control-h\)/);
    expect(ruleFor(".tray-bar .tray-bar__edit")).not.toMatch(/height/);
    expect(strip(css)).not.toMatch(/\.tray-bar[^{]*\.k-(btn|iconbtn)[^{]*{[^}]*height/);
  });
});

describe("TrayBar as the phone's sheet", () => {
  const sheet = (over: Partial<TrayBarProps> = {}) =>
    bar({ phone: true, name: "Heroes", compartments: "6 figure pockets", ...over });
  const dialog = (): HTMLElement => screen.getByRole("dialog");

  it("is a modal dialog named by its h2, marked as the sheet", () => {
    sheet();
    const h2 = within(dialog()).getByRole("heading", { level: 2, name: "Heroes" });
    expect(dialog().getAttribute("aria-labelledby")).toBe(h2.id);
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(dialog().getAttribute("data-region")).toBe("sheet");
    expect(screen.queryByRole("region", { name: "Selected tray" })).toBeNull();
  });

  it("takes the focus on its heading when it opens", () => {
    sheet();
    expect(document.activeElement).toBe(within(dialog()).getByRole("heading", { level: 2 }));
  });

  it("says the layer and the compartments, then the size and what it costs to print", () => {
    sheet();
    expect(dialog().querySelector(".tray-sheet__meta")?.textContent).toBe(
      "Layer 1 (bottom) · 6 figure pockets",
    );
    const dts = [...dialog().querySelectorAll("dt")].map((e) => e.textContent);
    expect(dts).toEqual(["Size", "Printing"]);
    expect(dialog().querySelector("dd")?.textContent).toBe("72 × 96 × 40 mm");
    expect(dialog().querySelectorAll("dd")[1]?.textContent).toMatch(
      /^about [\d.]+ (h|min), \d+ g$/,
    );
  });

  it("has a full-width Edit <name>, the three tiles and Close", () => {
    const onEdit = vi.fn();
    sheet({ onEdit });
    fireEvent.click(button("Edit Heroes"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    const tiles = dialog().querySelector(".tray-sheet__tiles") as HTMLElement;
    expect([...tiles.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Pin",
      "Turn 90°",
      "More",
    ]);
    expect(button("Close")).toBeTruthy();
  });

  it("opens More over the tiles, with Swap with… and Lock size", () => {
    const { p } = sheet({ onSwap: vi.fn() });
    const more = button("More");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(button("Swap with…").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button("Lock size"));
    expect(p.onToggleSizeLock).toHaveBeenCalledTimes(1);
  });

  it("Pin and Turn work as on the bar, and a blocked Turn says why under the tiles", () => {
    const { p } = sheet({ tray: tray({ w: 80, d: 80 }) });
    fireEvent.click(button("Pin"));
    expect(p.onPin).toHaveBeenCalledTimes(1);
    const turn = button("Turn 90°");
    expect(turn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(turn);
    expect(p.onTurn).not.toHaveBeenCalled();
    expect(dialog().querySelector(".tray-sheet__why")?.textContent).toMatch(/is square/);
  });

  it("gives a spacer only its name, what it is and Close", () => {
    const spacer = tray({ key: "spacer:0", part: "spacer", compartments: [] });
    bar({ phone: true, tray: spacer, project: planned([spacer]), name: "Spacer" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(dialog().querySelector(".tray-sheet__meta")?.textContent).toMatch(
      /^Fills the gap so the trays can't slide\. Print it too\./,
    );
    expect(dialog().querySelector("dl")).toBeNull();
  });

  it("closes on Escape and on a press on what is behind it", () => {
    const { p } = sheet();
    const cancel = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(p.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(dialog());
    expect(p.onClose).toHaveBeenCalledTimes(2);
    // a press inside it does not
    fireEvent.click(within(dialog()).getByRole("heading", { level: 2 }));
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it("is 404 px tall, over the page with the modal sheet's shadow", () => {
    const rule = ruleFor(".k-sheetmodal", strip(kit));
    expect(rule).toMatch(/box-shadow:\s*var\(--shadow-sheet-modal\)/);
    expect(rule).toMatch(/height:\s*var\(--tray-sheet-h\)/);
    expect(strip(tokens)).toMatch(/--tray-sheet-h:\s*404px/);
    expect(ruleFor(".tray-sheet__tile.k-btn")).toMatch(/min-height:\s*68px/);
    expect(ruleFor(".tray-sheet__tiles")).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
  });
});
