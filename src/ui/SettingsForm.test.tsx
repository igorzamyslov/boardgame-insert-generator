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
import { EXACT_GROUPS, FIRST_SCREEN_PATHS } from "./settingsGroups";
import { SETTING_SETTERS, settingUnit } from "./settingsFields";

afterEach(cleanup);

const changedFrom = (over: Partial<typeof DEFAULT_SETTINGS>) => ({ ...DEFAULT_SETTINGS, ...over });

const error = (path: string, message: string, code = "field.setting") => ({
  level: "error" as const,
  code,
  message,
  path,
});

/**
 * The number of rows the search can show: every exact number and the two choices, less the wall
 * thickness, which "Fill small gaps with" draws itself, and the numbers of the first screen.
 */
const ROWS = SETTING_RANGES.length + 1 - FIRST_SCREEN_PATHS.length;

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

  it("offers Fit in the box as Snug, Standard, Loose and Custom, and writes the resolved value", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const fit = within(screen.getByRole("group", { name: "Fit in the box" }));
    expect(fit.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Snug",
      "Standard",
      "Loose",
      "Custom",
    ]);
    expect(fit.getByRole("button", { name: "Standard" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(fit.getByRole("button", { name: "Loose" }));
    expect(onChange).toHaveBeenLastCalledWith(applyFitChoice(DEFAULT_SETTINGS, "loose"));
    fireEvent.click(fit.getByRole("button", { name: "Snug" }));
    expect(onChange).toHaveBeenLastCalledWith(applyFitChoice(DEFAULT_SETTINGS, "tight"));
  });

  it("offers Walls as Thin, Standard, Sturdy and Custom, and writes the resolved value", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const walls = within(screen.getByRole("group", { name: "Walls" }));
    expect(walls.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Thin",
      "Standard",
      "Sturdy",
      "Custom",
    ]);
    expect(walls.getByRole("button", { name: "Standard" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(walls.getByRole("button", { name: "Sturdy" }));
    expect(onChange).toHaveBeenLastCalledWith(applyWallChoice(DEFAULT_SETTINGS, "sturdy"));
    fireEvent.click(walls.getByRole("button", { name: "Thin" }));
    expect(onChange).toHaveBeenLastCalledWith(applyWallChoice(DEFAULT_SETTINGS, "thin"));
    // Thin is the floors and the dividers as well, not the wall alone
    expect(applyWallChoice(DEFAULT_SETTINGS, "thin")).toMatchObject({
      wall: 1,
      floor: 1,
      divider: 1,
    });
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

  it("shows Custom when only the floor or the dividers differ from the choice, and says which", () => {
    render(<InsertSettings settings={changedFrom({ floor: 1 })} onChange={vi.fn()} />);
    const walls = within(screen.getByRole("group", { name: "Walls" }));
    expect(walls.getByRole("button", { name: "Custom" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("You set the floor or the dividers below.")).toBeTruthy();
    expect(screen.queryByText(/You set the wall to/)).toBeNull();
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

  it("says a fit that is no choice: Custom pressed and marked changed, a dot, and the value below", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={changedFrom({ fit: 1.2 })} onChange={onChange} />);
    const fit = within(screen.getByRole("group", { name: "Fit in the box" }));
    expect(fit.getByRole("button", { name: "Custom" }).getAttribute("aria-pressed")).toBe("true");
    expect(fit.getByRole("button", { name: "Custom" }).hasAttribute("data-changed")).toBe(true);
    for (const name of ["Snug", "Standard", "Loose"]) {
      expect(fit.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    }
    expect(screen.getByText("You set the fit to 1.2 below.")).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Changed" })).toHaveLength(1);
    // like Walls' Custom, it takes the person to the number and sets nothing
    fireEvent.click(fit.getByRole("button", { name: "Custom" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("settings-fit");
  });

  it("takes Fit's Custom to the Fit number from another group", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Fit in the box" })).getByRole("button", {
        name: "Custom",
      }),
    );
    expect(document.activeElement?.id).toBe("settings-fit");
  });

  it("offers Room for fingers, Rim between layers and Fill to the lid with the board's hints", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const fingers = screen.getByRole("checkbox", { name: "Room for fingers" }) as HTMLInputElement;
    expect(fingers.checked).toBe(false);
    fireEvent.click(fingers);
    expect(onChange).toHaveBeenLastCalledWith(applyFingerRoom(DEFAULT_SETTINGS, true));
    const rim = screen.getByRole("checkbox", { name: /^Rim between layers/ }) as HTMLInputElement;
    expect(rim.checked).toBe(true);
    fireEvent.click(rim);
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: false },
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

describe("InsertSettings: Kind of rim, under Rim between layers", () => {
  const section = (): HTMLElement =>
    screen.getByRole("region", { name: "How the trays sit" }) as HTMLElement;
  const stepped = {
    ...DEFAULT_SETTINGS,
    lip: { ...DEFAULT_SETTINGS.lip, kind: "step" as const },
  };

  it("offers the rim and groove (pressed by default) and the stepped base, with what each costs", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const kind = within(section()).getByRole("group", { name: "Kind of rim" });
    const rim = within(kind).getByRole("button", { name: "Rim and groove" });
    expect(rim.getAttribute("aria-pressed")).toBe("true");
    expect(within(section()).getByText("Trays with one on top get thicker walls.")).toBeTruthy();
    fireEvent.click(within(kind).getByRole("button", { name: "Stepped base" }));
    expect(onChange).toHaveBeenCalledWith(stepped);
  });

  it("says what the step costs, and the switch's hint names the step", () => {
    render(<InsertSettings settings={stepped} onChange={vi.fn()} />);
    const here = within(section());
    expect(
      here.getByText("Walls stay thin; a tray with one on top is 1.75 mm deeper."),
    ).toBeTruthy();
    expect(here.getByText("A step under each tray keeps the top layer from sliding")).toBeTruthy();
    const step = here.getByRole("button", { name: "Stepped base" });
    expect(step.getAttribute("aria-pressed")).toBe("true");
  });

  it("stays, blocked with its reason, while the rim is off", () => {
    const onChange = vi.fn();
    const off = { ...DEFAULT_SETTINGS, lip: { ...DEFAULT_SETTINGS.lip, enabled: false } };
    render(<InsertSettings settings={off} onChange={onChange} />);
    const step = within(section()).getByRole("button", { name: "Stepped base" });
    expect(step.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(step);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByText("Needs Rim between layers.").length).toBeGreaterThan(0);
  });
});

describe("InsertSettings: the riser rows beside Fill to the lid", () => {
  const LABEL = /^Separate risers from( \(mm\))?$/;
  const FOLD = "Fold risers into the joined spacers";
  const section = (): HTMLElement =>
    screen.getByRole("region", { name: "How the trays sit" }) as HTMLElement;
  const before = (a: Element, b: Element): boolean =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it("draws both in How the trays sit, after Fill to the lid, and not under Exact numbers", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    const here = within(section());
    const lid = here.getByRole("checkbox", { name: "Fill to the lid" });
    const number = here.getByLabelText(LABEL);
    const fold = here.getByRole("checkbox", { name: FOLD });
    expect(before(lid, number)).toBe(true);
    expect(before(number, fold)).toBe(true);
    // one box, 3 mm, with its unit said beside it
    expect((number as HTMLInputElement).value).toBe("3");
    expect(number.closest(".st-num-unit")?.textContent).toContain("mm");
    expect(here.getByText("Smaller padding stays a thicker tray floor.")).toBeTruthy();
    // the search covers Exact numbers only, and this number is no part of it
    expect(FIRST_SCREEN_PATHS).toContain("minRiser");
    for (const g of EXACT_GROUPS) {
      expect(g.paths).not.toContain("minRiser");
    }
    expect(screen.getAllByLabelText(LABEL)).toHaveLength(1);
  });

  it("has the riser fold on by default, and writes the switch", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const fold = screen.getByRole("checkbox", { name: FOLD }) as HTMLInputElement;
    expect(fold.checked).toBe(true);
    expect(screen.queryByRole("button", { name: `Back to on for ${FOLD}` })).toBeNull();
    fireEvent.click(fold);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, mergeRisers: false });
  });

  it("blocks the riser fold while spacers are not joined, with the same words as before", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={changedFrom({ mergeFillers: false })} onChange={onChange} />);
    const fold = screen.getByRole("checkbox", { name: FOLD }) as HTMLInputElement;
    expect(fold.getAttribute("aria-disabled")).toBe("true");
    const why = (fold.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(why).toContain("Needs joined spacers.");
    fireEvent.click(fold);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("writes the least riser in mm, and offers the way back to 3 once it differs", () => {
    const onChange = vi.fn();
    const view = render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    expect(within(section()).queryByRole("button", { name: /^Back to 3/ })).toBeNull();
    fireEvent.input(field(LABEL), { target: { value: "5,5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, minRiser: 5.5 });
    view.rerender(<InsertSettings settings={changedFrom({ minRiser: 10 })} onChange={onChange} />);
    const back = within(section()).getByRole("button", {
      name: "Back to 3 for Separate risers from",
    });
    expect(back.textContent).toBe("Back to 3");
    fireEvent.click(back);
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_SETTINGS);
  });

  it("says a value outside 1 to 50 mm next to the box, with nothing closed around it", () => {
    render(
      <ValidationContext.Provider
        value={[error("/settings/minRiser", "Separate risers from must be from 1 to 50.")]}
      >
        <InsertSettings settings={changedFrom({ minRiser: 80 })} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    const input = field(LABEL);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Separate risers from must be from 1 to 50.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(alert.closest("details")).toBeNull();
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
      "Rim between layers6 values",
      "Shape and printing6 values",
      "Spacers and space2 values",
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
        if (path === "wallAbsorb") {
          // its box belongs to the choice that uses it, and shows under Thicker walls
          expect(
            within(card(g.title)).getByRole("group", { name: "Fill small gaps with" }),
          ).toBeTruthy();
          continue;
        }
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

  it("offers the play limit among the exact numbers", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    openGroup("Shape and printing");
    fireEvent.input(field(/^Play limit/), { target: { value: "2,5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, playLimit: 2.5 });
  });

  it("keeps Unused space and Fill small gaps with under Spacers and space", () => {
    const onChange = vi.fn();
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    // not on the first screen
    expect(screen.queryByRole("group", { name: "Unused space" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Fill small gaps with" })).toBeNull();
    openGroup("Spacers and space");
    const space = within(screen.getByRole("group", { name: "Unused space" }));
    expect(space.getByRole("button", { name: "Spare tray" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(space.getByRole("button", { name: "Solid block" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, leftover: "solid" });
  });
});

describe("InsertSettings: Fill small gaps with (thicker walls and one thick wall)", () => {
  const gaps = () => within(screen.getByRole("group", { name: "Fill small gaps with" }));
  const pressed = (): string | undefined =>
    Array.from(
      screen.getByRole("group", { name: "Fill small gaps with" }).querySelectorAll("button"),
    ).find((b) => b.getAttribute("aria-pressed") === "true")?.textContent ?? undefined;

  it("is one choice of three, and a spacer is the default", () => {
    render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
    openGroup("Spacers and space");
    expect(
      Array.from(
        screen.getByRole("group", { name: "Fill small gaps with" }).querySelectorAll("button"),
      ).map((b) => b.textContent),
    ).toEqual(["A spacer", "Thicker walls", "One thick wall"]);
    expect(pressed()).toBe("A spacer");
    expect(
      screen.getByText("A gap a tray can't use is printed as a separate spacer."),
    ).toBeTruthy();
    // the two old rows are gone, and the number is not a row of its own
    expect(screen.queryByRole("checkbox", { name: /One thick wall/ })).toBeNull();
    expect(screen.queryByLabelText(/Extra thickness per wall/)).toBeNull();
  });

  it("starts thicker walls at 1 mm, and shows the number only while they are chosen", () => {
    const onChange = vi.fn();
    const view = render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    openGroup("Spacers and space");
    fireEvent.click(gaps().getByRole("button", { name: "Thicker walls" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      oneWall: false,
      wallAbsorb: 1,
    });
    view.rerender(<InsertSettings settings={changedFrom({ wallAbsorb: 1 })} onChange={onChange} />);
    expect(pressed()).toBe("Thicker walls");
    expect(
      screen.getByText("Instead of a spacer, every wall and divider may get up to 1 mm thicker."),
    ).toBeTruthy();
    fireEvent.input(field(/^Extra thickness per wall/), { target: { value: "1,5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, wallAbsorb: 1.5 });
    // 0 is "A spacer", so the box refuses it rather than flipping the choice while a number is typed
    fireEvent.input(field(/^Extra thickness per wall/), { target: { value: "0" } });
    expect(screen.getByRole("alert").textContent).toBe("Must be more than 0.");
  });

  it("turns one thick wall on, naming what it does to a gap, and keeps the thicker-walls amount", () => {
    const onChange = vi.fn();
    const view = render(
      <InsertSettings settings={changedFrom({ wallAbsorb: 2 })} onChange={onChange} />,
    );
    openGroup("Spacers and space");
    fireEvent.click(gaps().getByRole("button", { name: "One thick wall" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      oneWall: true,
      wallAbsorb: 2,
    });
    view.rerender(
      <InsertSettings
        settings={changedFrom({ oneWall: true, wallAbsorb: 2 })}
        onChange={onChange}
      />,
    );
    expect(pressed()).toBe("One thick wall");
    expect(
      screen.getByText(/^Instead of a spacer, one outer wall in each direction takes up to 20 mm/),
    ).toBeTruthy();
    // the amount is ignored while one thick wall is on, so its box is not shown
    expect(screen.queryByLabelText(/Extra thickness per wall/)).toBeNull();
    fireEvent.click(gaps().getByRole("button", { name: "Thicker walls" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      oneWall: false,
      wallAbsorb: 2,
    });
  });

  it("has the dot and Back to a spacer only while another choice is made, and Back puts both settings back", () => {
    const onChange = vi.fn();
    const view = render(<InsertSettings settings={DEFAULT_SETTINGS} onChange={onChange} />);
    openGroup("Spacers and space");
    expect(screen.queryByRole("button", { name: /^Back to a spacer/ })).toBeNull();
    expect(view.container.querySelector(".st-dot")).toBeNull();
    for (const over of [{ wallAbsorb: 2 }, { oneWall: true }, { oneWall: true, wallAbsorb: 2 }]) {
      view.rerender(<InsertSettings settings={changedFrom(over)} onChange={onChange} />);
      expect(view.container.querySelectorAll(".st-dot")).toHaveLength(1);
      fireEvent.click(
        screen.getByRole("button", { name: "Back to a spacer for Fill small gaps with" }),
      );
      expect(onChange).toHaveBeenLastCalledWith(DEFAULT_SETTINGS);
    }
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

  it("marks Fill small gaps with by a dot when one thick wall is chosen", () => {
    const { container } = render(
      <InsertSettings settings={changedFrom({ oneWall: true })} onChange={vi.fn()} />,
    );
    fireEvent.click(groupRow("Spacers and space"));
    expect(container.querySelectorAll(".st-dot")).toHaveLength(1);
  });

  it("counts Unused space and Fill small gaps with among the group's changes, the choice once", () => {
    render(
      <InsertSettings
        settings={changedFrom({ leftover: "solid", oneWall: true, wallAbsorb: 2 })}
        onChange={vi.fn()}
      />,
    );
    // two settings (one thick wall, and the wall thickness it ignores) are one choice
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
    // the words count too: Fit mentions the lip and play, and Step height its lip play
    expect(shown().map((t) => t.replace(/ \(mm\)$/, ""))).toEqual([
      "Fit",
      "Lip play",
      "Step height",
    ]);
    expect(screen.getByRole("status").textContent).toMatch(/^3 of \d+ shown\.$/);
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
