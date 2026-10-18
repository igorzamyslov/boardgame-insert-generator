// src/ui/SettingsForm.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  applyFingerRoom,
  applyFitChoice,
  applyWallChoice,
} from "../model/settings";
import { SETTING_RANGES } from "../model/validate";
import { ValidationContext } from "./validation";
import { InsertSettings, PrintingOptions, changedRanges } from "./SettingsForm";
import { EXACT_GROUPS } from "./settingsGroups";
import { SETTING_SETTERS, settingUnit } from "./settingsFields";

afterEach(cleanup);

const changedFrom = (over: Partial<typeof DEFAULT_SETTINGS>) => ({ ...DEFAULT_SETTINGS, ...over });

const error = (path: string, message: string, code = "field.setting") => ({
  level: "error" as const,
  code,
  message,
  path,
});

/** The number of rows the search can show: every exact number and the two extras. */
const ROWS = SETTING_RANGES.length + 2;

const WALL = /^Wall( \(mm\))?$/;
const field = (name: RegExp | string): HTMLInputElement =>
  screen.getByLabelText(name) as HTMLInputElement;
const card = (title: string): HTMLElement => screen.getByRole("group", { name: title });
/** The row that opens a closed group: a button named by its title, then its meta. */
const groupRow = (title: string): HTMLElement =>
  screen.getByRole("button", { name: new RegExp(`^${title}`) });
const openGroup = (title: string): void => {
  fireEvent.click(groupRow(title));
};
const search = (text: string): void => {
  fireEvent.input(screen.getByRole("searchbox", { name: "Find a setting" }), {
    target: { value: text },
  });
};

describe("SETTING_SETTERS", () => {
  it("has a setter for every validated setting that writes what get() reads", () => {
    for (const r of SETTING_RANGES) {
      const set = SETTING_SETTERS[r.path];
      expect(set, r.path).toBeDefined();
      if (set) {
        expect(r.get(set(DEFAULT_SETTINGS, 0.77))).toBe(0.77);
      }
    }
  });

  it("has no setter beyond the validated settings", () => {
    expect(Object.keys(SETTING_SETTERS).sort()).toEqual(SETTING_RANGES.map((r) => r.path).sort());
  });

  it("names units", () => {
    expect(settingUnit("wall")).toBe("mm");
    expect(settingUnit("fit")).toBeUndefined();
    expect(settingUnit("packingFactor")).toBeUndefined();
  });
});

describe("InsertSettings: how the trays sit", () => {
  it("puts the plain choices first, and Exact numbers after them", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["How the trays sit", "Exact numbers"]);
  });

  it("offers Fit in the box as Snug, Standard and Loose, and writes the resolved value", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const fit = within(screen.getByRole("group", { name: "Fit in the box" }));
    expect(fit.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Snug",
      "Standard",
      "Loose",
    ]);
    expect(fit.getByRole("button", { name: "Standard" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(fit.getByRole("button", { name: "Loose" }));
    expect(onChange).toHaveBeenLastCalledWith(applyFitChoice(DEFAULT_SETTINGS, "loose"));
    fireEvent.click(fit.getByRole("button", { name: "Snug" }));
    expect(onChange).toHaveBeenLastCalledWith(applyFitChoice(DEFAULT_SETTINGS, "tight"));
  });

  it("offers Walls as Light, Standard, Sturdy and Custom, and writes the resolved value", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const walls = within(screen.getByRole("group", { name: "Walls" }));
    expect(walls.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Light",
      "Standard",
      "Sturdy",
      "Custom",
    ]);
    expect(walls.getByRole("button", { name: "Standard" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(walls.getByRole("button", { name: "Sturdy" }));
    expect(onChange).toHaveBeenLastCalledWith(applyWallChoice(DEFAULT_SETTINGS, "sturdy"));
    fireEvent.click(walls.getByRole("button", { name: "Light" }));
    expect(onChange).toHaveBeenLastCalledWith(applyWallChoice(DEFAULT_SETTINGS, "thin"));
    // no dot and no line while the wall is a choice
    expect(screen.queryByRole("img", { name: "Changed" })).toBeNull();
    expect(screen.queryByText(/You set the wall/)).toBeNull();
  });

  it("shows Custom for a wall that is no choice: pressed, marked changed, and said below", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={changedFrom({ wall: 1.8 })} onChange={onChange} />);
    const walls = within(screen.getByRole("group", { name: "Walls" }));
    expect(walls.getByRole("button", { name: "Custom" }).getAttribute("aria-pressed")).toBe("true");
    expect(walls.getByRole("button", { name: "Custom" }).hasAttribute("data-changed")).toBe(true);
    expect(screen.getByText("You set the wall to 1.8 mm below.")).toBeTruthy();
    // a dot after the label says it differs from its default
    expect(screen.getAllByRole("img", { name: "Changed" })).toHaveLength(1);
    // Custom is not a choice to make: it takes the person to the number
    fireEvent.click(walls.getByRole("button", { name: "Custom" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field(WALL));
  });

  it("takes Custom to the Wall number even from another group or a search", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    openGroup("Cards");
    search("zzzz");
    fireEvent.click(
      within(screen.getByRole("group", { name: "Walls" })).getByRole("button", { name: "Custom" }),
    );
    expect(document.activeElement).toBe(field(WALL));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });

  it("says a fit that is no choice: none pressed, a dot, and the value below", () => {
    render(<InsertSettings settings={changedFrom({ fit: 1.2 })} onChange={vi.fn()} />);
    const fit = within(screen.getByRole("group", { name: "Fit in the box" }));
    for (const b of fit.getAllByRole("button")) {
      expect(b.getAttribute("aria-pressed")).toBe("false");
    }
    expect(screen.getByText("You set the fit to 1.2 below.")).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Changed" })).toHaveLength(1);
  });

  it("offers Room for fingers, Rim between layers and Fill to the lid with the board's hints", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const fingers = screen.getByRole("checkbox", { name: "Room for fingers" }) as HTMLInputElement;
    expect(fingers.checked).toBe(false);
    fireEvent.click(fingers);
    expect(onChange).toHaveBeenLastCalledWith(applyFingerRoom(DEFAULT_SETTINGS, true));
    const rim = screen.getByRole("checkbox", { name: /^Rim between layers/ }) as HTMLInputElement;
    expect(rim.checked).toBe(false);
    fireEvent.click(rim);
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: true },
    });
    const lid = screen.getByRole("checkbox", { name: "Fill to the lid" }) as HTMLInputElement;
    expect(lid.checked).toBe(true);
    fireEvent.click(lid);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, fillToTop: false });
    expect(
      screen.getByText("A small rim on each tray keeps the top layer from sliding"),
    ).toBeTruthy();
    expect(screen.getByText("Keeps everything snug if the box is stored on its side")).toBeTruthy();
    expect(screen.queryByText(/Top layer stays put/)).toBeNull();
  });

  it("uses Rim between layers", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /^Rim between layers/ })).toBeTruthy();
    expect(screen.queryByText("Top layer stays put")).toBeNull();
  });

  it("shows a custom finger room as on, and switches it off", () => {
    const onChange = vi.fn();
    const four = changedFrom({
      fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, wallRoom: 4 },
    });
    render(<InsertSettings settings={four} onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Room for fingers" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(applyFingerRoom(four, false));
  });
});

describe("InsertSettings: Exact numbers", () => {
  it("draws the title, its line, the search and the first group open", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Exact numbers" })).toBeTruthy();
    expect(screen.getByText("For fine-tuning. All in mm.")).toBeTruthy();
    expect(
      screen.getByRole("searchbox", { name: "Find a setting" }).getAttribute("placeholder"),
    ).toBe("Find a setting, like floor or lip");
    const walls = within(card("Walls and floors"));
    for (const name of ["Wall", "Floor", "Divider"]) {
      expect(walls.getByLabelText(new RegExp(`^${name}`)), name).toBeTruthy();
    }
  });

  it("folds every other group into a row that says how many values it has", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    const rows = EXACT_GROUPS.slice(1).map((g) => groupRow(g.title).textContent);
    expect(rows).toEqual([
      "Room around trays and pieces4 values",
      "Cards4 values",
      "Finger cuts4 values",
      "Rim between layers5 values",
      "Shape and printing6 values",
      "Spacers and space3 values",
    ]);
    expect(screen.queryByLabelText(/^Card clearance/)).toBeNull();
  });

  it("opens a group from its row, folds the one that was open, and moves the focus in", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    openGroup("Cards");
    const cards = within(card("Cards"));
    for (const name of [
      "Card clearance",
      "Card stack clearance",
      "Card stack clearance \\(fraction of the stack\\)",
      "Card thickness",
    ]) {
      expect(cards.getByLabelText(new RegExp(`^${name}( \\(mm\\))?$`)), name).toBeTruthy();
    }
    // Walls and floors folds into a row
    expect(screen.queryByRole("group", { name: "Walls and floors" })).toBeNull();
    expect(groupRow("Walls and floors").textContent).toBe("Walls and floors3 values");
    expect(document.activeElement).toBe(field(/^Card clearance( \(mm\))?$/));
  });

  it("draws a hint-less row: the label, the box and the engine's words only", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    expect(screen.queryByText(/Thickness of the outer walls of every tray/)).toBeNull();
    expect(field(WALL).getAttribute("aria-describedby")).toBeNull();
  });

  it("reaches every exact number, group by group, by its name", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    for (const g of EXACT_GROUPS) {
      if (g.id !== "walls") {
        openGroup(g.title);
      }
      for (const path of g.paths) {
        const r = SETTING_RANGES.find((x) => x.path === path);
        const label = (r?.label ?? "").replace(/[()]/g, "\\$&");
        // a unit is part of a number's name: "Wall (mm)"
        expect(
          within(card(g.title)).getAllByLabelText(new RegExp(`^${label}( \\((mm|%)\\))?$`)).length,
          path,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("commits what is typed, with a decimal comma", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    fireEvent.input(field(WALL), { target: { value: "1,8" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, wall: 1.8 });
    openGroup("Rim between layers");
    fireEvent.input(field(/^Lip play/), { target: { value: "0,3" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, play: 0.3 },
    });
  });

  it("offers the play limit and the wall absorption among the exact numbers", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    openGroup("Shape and printing");
    fireEvent.input(field(/^Play limit/), { target: { value: "2,5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, playLimit: 2.5 });
    openGroup("Spacers and space");
    fireEvent.input(field(/^Thicker walls instead of a spacer/), { target: { value: "1,5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, wallAbsorb: 1.5 });
  });

  it("keeps Unused space and One thick wall instead of a spacer under Spacers and space", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    // not on the first screen
    expect(screen.queryByRole("group", { name: "Unused space" })).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "One thick wall instead of a spacer" }),
    ).toBeNull();
    openGroup("Spacers and space");
    const space = within(screen.getByRole("group", { name: "Unused space" }));
    expect(space.getByRole("button", { name: "Spare tray" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(space.getByRole("button", { name: "Solid block" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, leftover: "solid" });
    const one = screen.getByRole("checkbox", {
      name: "One thick wall instead of a spacer",
    }) as HTMLInputElement;
    expect(one.checked).toBe(false);
    // the kit's compact CheckRow: a 44 px row, not a bare box
    expect(one.closest(".k-check")?.hasAttribute("data-compact")).toBe(true);
    expect(one.classList.contains("k-check__box")).toBe(true);
    fireEvent.click(one);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, oneWall: true });
  });
});

describe("InsertSettings: what differs from the default", () => {
  it("marks nothing, and offers no way back, when every value is the default", () => {
    const { container } = render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    expect(screen.queryByText(/ changed$/)).toBeNull();
    expect(container.querySelector(".st-dot")).toBeNull();
    expect(changedRanges(DEFAULT_SETTINGS)).toEqual([]);
  });

  it("marks only the changed value: a dot, a heavier box and Back to its default", () => {
    const onChange = vi.fn();
    const s = changedFrom({ wall: 1.8, floor: 1.4 });
    render(<InsertSettings settings={s} onChange={onChange} />);
    const walls = within(card("Walls and floors"));
    expect(walls.getByText("2 changed")).toBeTruthy();
    expect(field(WALL).hasAttribute("data-changed")).toBe(true);
    expect(field(/^Divider/).hasAttribute("data-changed")).toBe(false);
    expect(walls.getAllByRole("button", { name: /^Back to/ }).map((b) => b.textContent)).toEqual([
      "Back to 1.6",
      "Back to 1.2",
    ]);
    fireEvent.click(walls.getByRole("button", { name: /^Back to 1\.6/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ ...s, wall: DEFAULT_SETTINGS.wall });
  });

  it("keeps the focus on the number when its Back to button goes", () => {
    function Host() {
      return <InsertSettings settings={changedFrom({ wall: 1.8 })} onChange={vi.fn()} />;
    }
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: /^Back to 1\.6/ }));
    expect(document.activeElement).toBe(field(WALL));
  });

  it("restores a nested value (the rim's play) and a unitless one (Fit)", () => {
    const onChange = vi.fn();
    const s = changedFrom({ fit: 1.4, lip: { ...DEFAULT_SETTINGS.lip, play: 0.4 } });
    render(<InsertSettings settings={s} onChange={onChange} />);
    openGroup("Rim between layers");
    fireEvent.click(screen.getByRole("button", { name: /^Back to 0\.25/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...s, lip: { ...s.lip, play: 0.25 } });
    cleanup();
    render(<InsertSettings settings={s} onChange={onChange} />);
    openGroup("Room around trays and pieces");
    fireEvent.click(screen.getByRole("button", { name: /^Back to 1 for Fit/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...s, fit: 1 });
  });

  it("counts the changed values of a group, open or folded", () => {
    render(
      <InsertSettings
        settings={changedFrom({ cornerRadius: 4.5, scoopRadius: 8, trayGap: 0.4 })}
        onChange={vi.fn()}
      />,
    );
    expect(groupRow("Shape and printing").textContent).toBe("Shape and printing2 changed");
    expect(groupRow("Room around trays and pieces").textContent).toBe(
      "Room around trays and pieces1 changed",
    );
    expect(groupRow("Cards").textContent).toBe("Cards4 values");
    openGroup("Shape and printing");
    expect(within(card("Shape and printing")).getByText("2 changed")).toBeTruthy();
  });

  it("counts Room for fingers once in the Finger cuts card, as the header does", () => {
    render(
      <InsertSettings settings={applyFingerRoom(DEFAULT_SETTINGS, true)} onChange={vi.fn()} />,
    );
    expect(groupRow("Finger cuts").textContent).toBe("Finger cuts1 changed");
    // a number of its own beside it is a second change
    cleanup();
    const more = applyFingerRoom(DEFAULT_SETTINGS, true);
    render(
      <InsertSettings
        settings={{ ...more, fingerPocket: { ...more.fingerPocket, width: 30 } }}
        onChange={vi.fn()}
      />,
    );
    expect(groupRow("Finger cuts").textContent).toBe("Finger cuts2 changed");
  });

  it("counts a choice made in the plain controls, which write the same numbers", () => {
    render(
      <InsertSettings settings={applyWallChoice(DEFAULT_SETTINGS, "sturdy")} onChange={vi.fn()} />,
    );
    expect(within(card("Walls and floors")).getByText("1 changed")).toBeTruthy();
  });

  it("marks a switch that was changed with a dot, like a number", () => {
    const { container } = render(
      <InsertSettings settings={changedFrom({ oneWall: true })} onChange={vi.fn()} />,
    );
    fireEvent.click(groupRow("Spacers and space"));
    expect(container.querySelector(".k-check__dot")).not.toBeNull();
  });

  it("counts Unused space and One thick wall among the group's changes", () => {
    render(
      <InsertSettings
        settings={changedFrom({ leftover: "solid", oneWall: true })}
        onChange={vi.fn()}
      />,
    );
    expect(groupRow("Spacers and space").textContent).toBe("Spacers and space2 changed");
  });
});

describe("InsertSettings: errors", () => {
  const bad = error("/settings/bottomChamfer", "Bottom chamfer is too big");
  const form = (notices: ReturnType<typeof error>[]) => (
    <ValidationContext.Provider value={notices}>
      <InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
    </ValidationContext.Provider>
  );

  it("opens the group of a field with an error, and keeps it open once fixed", () => {
    const view = render(form([]));
    expect(screen.queryByRole("group", { name: "Shape and printing" })).toBeNull();
    view.rerender(form([bad]));
    expect(screen.getByRole("group", { name: "Shape and printing" })).toBeTruthy();
    view.rerender(form([]));
    expect(screen.getByRole("group", { name: "Shape and printing" })).toBeTruthy();
  });

  it("opens straight on the group that holds an error", () => {
    render(form([bad]));
    expect(screen.getByRole("group", { name: "Shape and printing" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Walls and floors" })).toBeNull();
  });

  it.each([
    ["field.bottomChamfer", "Bottom chamfer is more than the walls allow."],
    ["field.lipBearing", "The lip would not rest on the ledge."],
  ])("shows %s beside the bottom chamfer field", (code, message) => {
    render(
      <ValidationContext.Provider value={[error("/settings/bottomChamfer", message, code)]}>
        <InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    const input = field(/^Bottom chamfer/);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("says what is typed wrong before the engine does", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    fireEvent.input(field(WALL), { target: { value: "x" } });
    expect(screen.getByRole("alert").textContent).toMatch(/^Not a number/);
  });
});

describe("InsertSettings: search", () => {
  const shown = (): string[] =>
    [...document.querySelectorAll(".st-card .st-row__label")].map((l) => l.textContent ?? "");

  it("finds Unused space under Exact numbers", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    search("unused");
    expect(screen.getByText("Unused space")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(`1 of ${ROWS} shown.`);
  });

  it("shows every group's numbers until something is typed", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("group", { name: "Walls and floors" })).toBeTruthy();
  });

  it("narrows to the numbers whose name or words have every typed word, whatever the case", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    search("LIP play");
    // the words count too: Fit mentions the lip and play
    expect(shown().map((t) => t.replace(/ \(mm\)$/, ""))).toEqual(["Fit", "Lip play"]);
    expect(screen.getByRole("status").textContent).toMatch(/^2 of \d+ shown\.$/);
    search("");
    expect(screen.getByRole("group", { name: "Walls and floors" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("finds a number by the name of its group", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    search("finger cuts");
    expect(within(card("Finger cuts")).getAllByRole("textbox")).toHaveLength(4);
  });

  it("says when nothing matches, and keeps a field with an error on screen", () => {
    const view = render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    search("zzzz");
    expect(screen.getByRole("status").textContent).toBe("No exact number matches.");
    view.unmount();
    render(
      <ValidationContext.Provider
        value={[error("/settings/bottomChamfer", "Bottom chamfer is too big")]}
      >
        <InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    search("zzzz");
    expect(shown().map((t) => t.replace(/ \(mm\)$/, ""))).toEqual(["Bottom chamfer"]);
    expect(screen.getByRole("status").textContent).toBe(`1 of ${ROWS} shown.`);
  });
});

describe("PrintingOptions", () => {
  it("is the Printing section, tagged as moving no trays", () => {
    render(<PrintingOptions settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /^Printing/ })).toBeTruthy();
    expect(screen.getByText("Doesn't move any trays")).toBeTruthy();
  });

  it("offers the tray name engraving, on by default, with the example from the project", () => {
    const onChange = vi.fn();
    render(
      <PrintingOptions
        settings={DEFAULT_SETTINGS}
        onChange={onChange}
        nameExample={{ full: "Starter decks", short: "Starter" }}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Engrave tray names" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(
      screen.getByText("Long names are shortened to fit, like “Starter decks” → “Starter”"),
    ).toBeTruthy();
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, engraveNames: false });
  });

  it("gives the hint without an example when no tray has a shorter name", () => {
    render(<PrintingOptions settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByText("Long names are shortened to fit")).toBeTruthy();
  });

  it("offers joining spacers, on by default", () => {
    const onChange = vi.fn();
    render(<PrintingOptions settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const box = screen.getByRole("checkbox", {
      name: "Join spacers into fewer pieces to print",
    }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, mergeFillers: false });
  });
});
