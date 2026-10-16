// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import css from "../style.css?raw";
import { turnTray } from "../app/actions";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { inputsHash } from "../model/hash";
import type { CompartmentSpec, Lock, Project, TraySpec } from "../model/types";
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

describe("TrayBar", () => {
  it("names the tray, its layer, size, contents and a print estimate, without a number", () => {
    bar();
    expect(screen.getByRole("heading", { name: "Region deck" })).toBeTruthy();
    expect(screen.getByText("Layer 1 (bottom)")).toBeTruthy();
    expect(screen.getByText("72.0 × 96.0 × 40.0 mm")).toBeTruthy();
    expect(screen.getByText("Deck A ×40")).toBeTruthy();
    expect(screen.getByText(/^≈ \d+ g · ≈ .+ (min|h)$/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Selected tray" }).textContent).not.toMatch(/#\d/);
  });

  it("Pin toggles to Unpin", () => {
    const { p, view } = bar();
    const pin = button("Pin");
    // The label is the action and the chip carries the state: no aria-pressed to say it twice.
    expect(pin.hasAttribute("aria-pressed")).toBe(false);
    expect(screen.queryByText("Pinned")).toBeNull();
    fireEvent.click(pin);
    expect(p.onPin).toHaveBeenCalledTimes(1);
    const locks: Lock[] = [{ kind: "position", trayKey: KEY, path: "0", rotated: false }];
    view.rerender(<TrayBar {...p} project={planned([p.tray], locks)} />);
    expect(button("Unpin").hasAttribute("aria-pressed")).toBe(false);
    expect(button("Unpin").getAttribute("data-on")).toBe("true");
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    expect(screen.getByText("Pinned")).toBeTruthy();
  });

  it("says Pinned, turned for a pin that turned the tray", () => {
    const base = planned([tray()]);
    const turned = turnTray(base, tray());
    bar({ project: turned });
    expect(screen.getByText("Pinned, turned")).toBeTruthy();
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("Turn 90° asks to turn, and is offered while nothing is in the way", () => {
    const { p } = bar();
    const turn = button("Turn 90°");
    expect(turn.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(turn);
    expect(p.onTurn).toHaveBeenCalledTimes(1);
  });

  it("Turn says why it is unavailable for a square tray", () => {
    const { p } = bar({ tray: tray({ w: 80, d: 80.3 }) });
    const turn = button("Turn 90°");
    expect(turn.getAttribute("aria-disabled")).toBe("true");
    expect(turn.hasAttribute("disabled")).toBe(false);
    const why = screen.getByText("This tray is square, so turning changes nothing.");
    expect(turn.getAttribute("aria-describedby")).toBe(why.id);
    fireEvent.click(turn);
    expect(p.onTurn).not.toHaveBeenCalled();
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
      screen.getByText(/^Turning doesn't work for .+: it conflicts with the size lock/),
    ).toBeTruthy();
  });

  it("Lock size toggles, and says Unlock size once locked", () => {
    const { p, view } = bar();
    const lock = button("Lock size");
    expect(lock.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(lock);
    expect(p.onToggleSizeLock).toHaveBeenCalledTimes(1);
    const locks: Lock[] = [{ kind: "size", trayKey: KEY, w: 72, d: 96, h: 40 }];
    view.rerender(<TrayBar {...p} project={planned([p.tray], locks)} />);
    expect(button("Unlock size").hasAttribute("aria-pressed")).toBe(false);
    expect(screen.getByText("Size locked")).toBeTruthy();
  });

  it("explains, once, why a spare tray can't be pinned, turned, swapped or size-locked", () => {
    const spare = tray({ key: "leftover:0", part: "leftover", compartments: [] });
    const { p } = bar({ tray: spare, project: planned([spare]), onSwap: vi.fn() });
    const why = screen.getByText(/can't be pinned, turned or swapped/);
    for (const name of ["Pin", "Turn 90°", "Swap with…", "Lock size"]) {
      const b = button(name);
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.getAttribute("aria-describedby")).toBe(why.id);
      fireEvent.click(b);
    }
    expect(p.onPin).not.toHaveBeenCalled();
    expect(p.onTurn).not.toHaveBeenCalled();
    expect(p.onToggleSizeLock).not.toHaveBeenCalled();
    expect(p.onSwap).not.toHaveBeenCalled();
  });

  it("offers Swap with… only where a swap can be made, and shows it under way", () => {
    const { p, view } = bar();
    expect(screen.queryByRole("button", { name: "Swap with…" })).toBeNull();
    const onSwap = vi.fn();
    view.rerender(<TrayBar {...p} onSwap={onSwap} />);
    const swap = button("Swap with…");
    expect(swap.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(swap);
    expect(onSwap).toHaveBeenCalledTimes(1);
    view.rerender(<TrayBar {...p} onSwap={onSwap} swapping />);
    expect(button("Swap with…").getAttribute("aria-pressed")).toBe("true");
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

  it("says what a part sits on, by name", () => {
    bar({ relation: { label: "Sits on", name: "Region deck" } });
    expect(screen.getByText("Sits on")).toBeTruthy();
    expect(screen.getAllByText("Region deck").length).toBeGreaterThan(1);
  });

  it("warns that the sizes may not match a plan the inputs have outgrown", () => {
    bar({ stale: true });
    expect(
      screen.getByText(
        /This plan is from before your last changes\. The sizes shown may not match\./,
      ),
    ).toBeTruthy();
  });

  it("keeps what it holds to one line, with the whole of it in the title", () => {
    const [first] = tray().compartments;
    const two = tray({
      compartments: [
        ...tray().compartments,
        { ...(first as CompartmentSpec), contents: "Event deck ×12" },
      ],
    });
    bar({ tray: two, project: planned([two]) });
    const line = screen.getByText("Deck A ×40, Event deck ×12");
    expect(line.getAttribute("title")).toBe("Deck A ×40, Event deck ×12");
    expect(css).toMatch(/\.tray-bar__contents dd\s*{[^}]*white-space:\s*nowrap/);
  });

  it("announces only the chips and the reason, not the buttons or the sizes", () => {
    bar({ onEdit: vi.fn(), onSwap: vi.fn(), tray: tray({ w: 80, d: 80 }) });
    const live = [...document.querySelectorAll("[aria-live]")];
    expect(live).toHaveLength(2);
    expect(live[0]?.classList.contains("tray-bar__chips")).toBe(true);
    expect(live[1]?.textContent).toMatch(/square/);
    expect(screen.getByRole("group", { name: "Selected tray" }).hasAttribute("aria-live")).toBe(
      false,
    );
    for (const el of live) {
      expect(el.querySelector("button, dl")).toBeNull();
    }
  });

  it("keeps the buttons in view when the bar scrolls, and every control is at least 44 px", () => {
    bar({ onEdit: vi.fn(), onSwap: vi.fn() });
    const foot = document.querySelector(".tray-bar__foot");
    expect(foot?.querySelectorAll("button").length).toBeGreaterThan(3);
    expect(css).toMatch(/\.tray-bar__foot\s*{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.tray-bar button\s*{[^}]*min-height:\s*var\(--control-h\)/);
    expect(css).toMatch(/\.tray-bar button\s*{[^}]*min-width:\s*var\(--control-h\)/);
  });
});

describe("TrayBar of a merged part", () => {
  const filler = makeTray({ key: "leftover:0", part: "leftover", solid: true, compartments: [] });
  const riser = makeTray({ key: "a:p0:0:riser", part: "riser", compartments: [] });
  const merged = (members: TraySpec[], flipped: boolean): TraySpec =>
    makeTray({
      key: "merged:0",
      part: "leftover",
      solid: true,
      compartments: [],
      merged: { members, bridges: [], flipped },
    });
  const show = (t: TraySpec) => bar({ tray: t, project: planned([t]), name: "Filler" });

  it("says what it joins", () => {
    show(merged([filler, { ...filler, key: "leftover:1" }], false));
    expect(screen.getByText("Joins")).toBeTruthy();
    expect(screen.getByText("2 spacers, printed as one piece.")).toBeTruthy();
  });

  it("counts a riser folded in", () => {
    show(merged([riser, filler], false));
    expect(screen.getByText("1 spacer and a riser, printed as one piece.")).toBeTruthy();
  });

  it("tells you to print one with members on different floors upside down", () => {
    show(merged([filler, { ...filler, key: "leftover:1", z: 28 }], true));
    expect(screen.getByText(/Print it upside down, the flat top on the bed/)).toBeTruthy();
  });

  it("has no Joins row for any other part", () => {
    bar();
    expect(screen.queryByText("Joins")).toBeNull();
  });
});
