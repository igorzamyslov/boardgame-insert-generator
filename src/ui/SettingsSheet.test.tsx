// src/ui/SettingsSheet.test.tsx
// @vitest-environment jsdom
import { useState } from "preact/hooks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRINTER } from "../model/defaults";
import { DEFAULT_SETTINGS, applyFingerRoom, applyWallChoice } from "../model/settings";
import type { Notice, Printer, Settings } from "../model/types";
import { SETTING_RANGES } from "../model/validate";
import { SettingsSheet, settingsTabFor } from "./SettingsSheet";
import type { SettingsSheetProps } from "./SettingsSheet";
import { ValidationContext } from "./validation";

afterEach(cleanup);

const MINE: Printer = { ...DEFAULT_PRINTER, bedX: 220, bedY: 220, bedZ: 250 };

function sheet(over: Partial<SettingsSheetProps> = {}, notices: Notice[] = []) {
  const props: SettingsSheetProps = {
    settings: DEFAULT_SETTINGS,
    onSettingsChange: vi.fn(),
    printer: DEFAULT_PRINTER,
    myPrinter: DEFAULT_PRINTER,
    onMyPrinterChange: vi.fn(),
    onApplyPrinter: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  const ui = (p: SettingsSheetProps, n: Notice[]) => (
    <ValidationContext.Provider value={n}>
      <SettingsSheet {...p} />
    </ValidationContext.Provider>
  );
  const view = render(ui(props, notices));
  return {
    props,
    view,
    again: (n: Notice[], next: Partial<SettingsSheetProps> = {}) =>
      view.rerender(ui({ ...props, ...next }, n)),
  };
}

const tab = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });
const pressed = (): string[] =>
  within(screen.getByRole("group", { name: "Settings for" }))
    .getAllByRole("button")
    .filter((t) => t.getAttribute("aria-pressed") === "true")
    .map((t) => t.textContent ?? "");

const error = (path: string, message = "Something is wrong."): Notice => ({
  level: "error",
  code: "field.test",
  message,
  path,
});

describe("SettingsSheet", () => {
  it("opens as a drawer titled Settings, with one h1 that has the focus", () => {
    sheet();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.classList.contains("k-drawer")).toBe(true);
    expect(dialog.getAttribute("data-region")).toBe("drawer");
    const h1 = screen.getByRole("heading", { level: 1, name: "Settings" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.activeElement).toBe(h1);
  });

  it("has two tabs, This insert and My printer, as a quiet segment named Settings for", () => {
    sheet();
    const group = screen.getByRole("group", { name: "Settings for" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["This insert", "My printer"]);
    expect(group.getAttribute("data-tone")).toBe("quiet");
    expect(pressed()).toEqual(["This insert"]);
    fireEvent.click(tab(/^My printer/));
    expect(pressed()).toEqual(["My printer"]);
    fireEvent.click(tab("This insert"));
    expect(pressed()).toEqual(["This insert"]);
  });

  it("starts on the tab the person asked for", () => {
    sheet({ initialTab: "printer" });
    expect(pressed()).toEqual(["My printer"]);
  });

  it("keeps Done and says nothing about fitting", () => {
    const { props } = sheet();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const foot = dialog.querySelector(".st-foot") as HTMLElement;
    expect(
      within(foot)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Done"]);
    expect(screen.queryByText(/Still fits/)).toBeNull();
    fireEvent.click(within(foot).getByRole("button", { name: "Done" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("scrolls the body alone: the header, tabs and foot stay where they are", () => {
    sheet();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect([...dialog.children].map((c) => c.className)).toEqual([
      "st-head",
      "st-tabs",
      "st-body",
      "st-foot",
    ]);
  });

  it("every setting is reachable", () => {
    sheet({ myPrinter: { ...MINE, bedX: 123 } });
    // This insert: the plain choices, the switches, and every exact number from its group
    for (const name of ["Fit in the box", "Walls", "Walls and floors"]) {
      expect(screen.getByRole("group", { name }), name).toBeTruthy();
    }
    for (const name of ["Room for fingers", /^Rim between layers/, "Fill to the lid"]) {
      expect(screen.getByRole("checkbox", { name }), String(name)).toBeTruthy();
    }
    expect(screen.getByRole("searchbox", { name: "Find a setting" })).toBeTruthy();
    // the search finds each number by its name, whichever group it is in
    for (const r of SETTING_RANGES) {
      fireEvent.input(screen.getByRole("searchbox"), { target: { value: r.label } });
      if (r.path === "wallAbsorb") {
        // its box is drawn by "Fill small gaps with", under Thicker walls
        expect(screen.getByRole("group", { name: "Fill small gaps with" })).toBeTruthy();
        continue;
      }
      // a unit is part of a number's name: "Wall (mm)"
      const label = new RegExp(`^${r.label.replace(/[()]/g, "\\$&")}( \\((mm|%)\\))?$`);
      expect(screen.getAllByLabelText(label).length, r.path).toBeGreaterThan(0);
    }
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "unused" } });
    expect(screen.getByRole("group", { name: "Unused space" })).toBeTruthy();
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "one thick wall" } });
    expect(
      within(screen.getByRole("group", { name: "Fill small gaps with" })).getByRole("button", {
        name: "One thick wall",
      }),
    ).toBeTruthy();
    // My printer: the bed, its details, and what changes only the printing
    fireEvent.click(tab(/^My printer/));
    expect(screen.getByRole("group", { name: "Printer bed" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Printer details/ }));
    for (const name of ["Bed X", "Bed Y", "Bed Z", "Bed margin", "Layer height"]) {
      expect(screen.getByLabelText(new RegExp(`^${name}`)), name).toBeTruthy();
    }
    for (const name of [
      "Engrave tray names",
      "Join spacers into fewer pieces to print",
      "Fold risers into the joined spacers",
    ]) {
      expect(screen.getByRole("checkbox", { name }), name).toBeTruthy();
    }
  });

  it("Escape closes and returns focus", () => {
    const onClose = vi.fn();
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open settings
          </button>
          {open ? (
            <SettingsSheet
              settings={DEFAULT_SETTINGS}
              onSettingsChange={vi.fn()}
              printer={DEFAULT_PRINTER}
              myPrinter={DEFAULT_PRINTER}
              onMyPrinterChange={vi.fn()}
              onApplyPrinter={vi.fn()}
              onClose={() => {
                onClose();
                setOpen(false);
              }}
            />
          ) : null}
        </>
      );
    }
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Open settings" });
    opener.focus();
    fireEvent.click(opener);
    // Escape reaches a modal <dialog> as a cancel event.
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    // the Close button does the same
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("the header: N changed and Reset all", () => {
  it("says nothing, and offers no reset, while every setting is the default", () => {
    sheet();
    expect(screen.queryByText(/ changed$/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset all" })).toBeNull();
  });

  it("counts every setting that differs, on both tabs", () => {
    sheet({
      settings: {
        ...DEFAULT_SETTINGS,
        wall: 1.8,
        trayGap: 0.4,
        leftover: "solid",
        engraveNames: false,
      },
    });
    const head = document.querySelector(".st-head") as HTMLElement;
    expect(within(head).getByText("4 changed")).toBeTruthy();
    fireEvent.click(tab(/^My printer/));
    expect(within(head).getByText("4 changed")).toBeTruthy();
  });

  it("Reset all writes the defaults in one change, and gives the focus to the heading", () => {
    const { props } = sheet({ settings: { ...DEFAULT_SETTINGS, wall: 1.8, trayGap: 0.4 } });
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(props.onSettingsChange).toHaveBeenCalledTimes(1);
    expect(props.onSettingsChange).toHaveBeenLastCalledWith(DEFAULT_SETTINGS);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("Reset all hands out a copy, so the defaults cannot be edited through it", () => {
    const { props } = sheet({ settings: { ...DEFAULT_SETTINGS, wall: 1.8 } });
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    const given = (props.onSettingsChange as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(given).not.toBe(DEFAULT_SETTINGS);
    expect(given.lip).not.toBe(DEFAULT_SETTINGS.lip);
  });
});

describe("an error", () => {
  it("in a setting opens This insert with its group open", () => {
    sheet({}, [error("/settings/bottomChamfer", "Bottom chamfer is too big")]);
    expect(pressed()).toEqual(["This insert, needs attention"]);
    expect(screen.getByRole("group", { name: "Shape and printing" })).toBeTruthy();
    expect(screen.getByText("Bottom chamfer is too big")).toBeTruthy();
  });

  it("in the insert's printer opens My printer and says what is wrong", () => {
    sheet({}, [error("/printer/bedMargin", "Bed margin leaves no room.")]);
    expect(pressed()).toEqual(["My printer, needs attention"]);
    expect(screen.getByText("Bed margin leaves no room.")).toBeTruthy();
  });

  it("picks the settings tab when both have one, and marks the tab it did not open", () => {
    const both = [error("/settings/wall"), error("/printer/bedX")];
    expect(settingsTabFor(both)).toBe("insert");
    expect(settingsTabFor([error("/printer/bedX")])).toBe("printer");
    expect(settingsTabFor([])).toBe("insert");
    expect(settingsTabFor([{ ...error("/printer/bedX"), level: "warning" }])).toBe("insert");
    sheet({}, both);
    expect(tab("My printer, needs attention")).toBeTruthy();
  });

  it("that appears while it is open does not move the person to another tab", () => {
    const view = sheet();
    fireEvent.click(tab(/^My printer/));
    view.again([error("/settings/wall")]);
    expect(pressed()).toEqual(["My printer"]);
    expect(tab("This insert, needs attention")).toBeTruthy();
  });
});

describe("My printer", () => {
  const open = (over: Partial<SettingsSheetProps> = {}) => {
    const view = sheet(over);
    fireEvent.click(tab(/^My printer/));
    return view;
  };
  const details = (): void => {
    fireEvent.click(screen.getByRole("button", { name: /^Printer details/ }));
  };

  it("starts with what the printer is for, then the bed", () => {
    open();
    expect(screen.getByText("Bed, margin and layer height are kept in this browser.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Printer bed" })).toBeTruthy();
  });

  it("saves a change as the preference, leaving this insert to Apply", () => {
    const { props } = open();
    details();
    fireEvent.input(screen.getByLabelText(/^Bed margin/), { target: { value: "8" } });
    expect(props.onMyPrinterChange).toHaveBeenLastCalledWith({
      ...DEFAULT_PRINTER,
      bedMargin: 8,
    });
    expect(props.onApplyPrinter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Medium, 220 mm" }));
    expect(props.onMyPrinterChange).toHaveBeenLastCalledWith({
      ...DEFAULT_PRINTER,
      bedX: 220,
      bedY: 220,
      bedZ: 250,
    });
  });

  it("does not save a printer that cannot work, and says so", () => {
    const { props } = open();
    details();
    fireEvent.input(screen.getByLabelText(/^Bed margin/), { target: { value: "200" } });
    expect(props.onMyPrinterChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/^Not saved: /);
    fireEvent.input(screen.getByLabelText(/^Bed margin/), { target: { value: "6" } });
    expect(props.onMyPrinterChange).toHaveBeenLastCalledWith({
      ...DEFAULT_PRINTER,
      bedMargin: 6,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers Apply only when this insert uses another printer", () => {
    const same = open();
    expect(screen.queryByText("This insert uses another printer")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    same.again([], { printer: MINE });
    // the row is the first thing in the tab, above what the printer is for
    const row = screen.getByText("This insert uses another printer");
    const intro = screen.getByText("Bed, margin and layer height are kept in this browser.");
    expect(row.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(same.props.onApplyPrinter).toHaveBeenCalledTimes(1);
    // once they match, the row is gone
    same.again([], { printer: DEFAULT_PRINTER });
    expect(screen.queryByText("This insert uses another printer")).toBeNull();
  });

  it("compares the bed, the margin and the layer height", () => {
    const view = open();
    view.again([], { printer: { ...DEFAULT_PRINTER, layerHeight: 0.28 } });
    expect(screen.getByText("This insert uses another printer")).toBeTruthy();
    view.again([], { printer: { ...DEFAULT_PRINTER, bedMargin: 9 } });
    expect(screen.getByText("This insert uses another printer")).toBeTruthy();
  });

  it("keeps margin, layer height and folding risers under Printer details", () => {
    open();
    expect(screen.queryByLabelText(/^Bed margin/)).toBeNull();
    expect(screen.queryByLabelText(/^Layer height/)).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Fold risers into the joined spacers" }),
    ).toBeNull();
    details();
    expect(screen.getByLabelText(/^Bed margin/)).toBeTruthy();
    expect(screen.getByLabelText(/^Layer height/)).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Fold risers into the joined spacers" }),
    ).toBeTruthy();
  });

  it("edits this insert's printing options", () => {
    const { props } = open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Engrave tray names" }));
    expect(props.onSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      engraveNames: false,
    });
  });

  it("blocks the riser fold while spacers are not joined, and says why", () => {
    const { props } = open({ settings: { ...DEFAULT_SETTINGS, mergeFillers: false } });
    details();
    const box = screen.getByRole("checkbox", {
      name: "Fold risers into the joined spacers",
    }) as HTMLInputElement;
    expect(box.disabled).toBe(false);
    expect(box.getAttribute("aria-disabled")).toBe("true");
    const why = (box.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(why).toContain("Needs joined spacers.");
    fireEvent.click(box);
    expect(props.onSettingsChange).not.toHaveBeenCalled();
  });

  it("offers the fold when spacers are joined", () => {
    const { props } = open();
    details();
    fireEvent.click(screen.getByRole("checkbox", { name: "Fold risers into the joined spacers" }));
    expect(props.onSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      mergeRisers: true,
    });
  });

  it("gives the engraving hint the name of a tray, when the project has one", () => {
    open({ nameExample: { full: "Market deck", short: "Market" } });
    expect(
      screen.getByText("Long names are shortened to fit, like “Market deck” → “Market”"),
    ).toBeTruthy();
  });
});

describe("This insert", () => {
  it("edits this insert's settings from the first tab", () => {
    const { props } = sheet();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Walls" })).getByRole("button", { name: "Sturdy" }),
    );
    expect(props.onSettingsChange).toHaveBeenLastCalledWith(
      applyWallChoice(DEFAULT_SETTINGS, "sturdy"),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /^Rim between layers/ }));
    expect(props.onSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: true },
    });
  });

  it("puts the plain choices first, with Exact numbers after them", () => {
    sheet();
    const body = document.querySelector(".st-body") as HTMLElement;
    expect(
      within(body)
        .getAllByRole("heading")
        .map((h) => h.textContent),
    ).toEqual(["How the trays sit", "Exact numbers"]);
  });

  it("finds Unused space under Exact numbers", () => {
    sheet();
    expect(screen.queryByText("Unused space")).toBeNull();
    fireEvent.input(screen.getByRole("searchbox", { name: "Find a setting" }), {
      target: { value: "unused" },
    });
    expect(screen.getByText("Unused space")).toBeTruthy();
  });
});

describe("every switch shows when it was changed, and the way back", () => {
  const word = (on: boolean): string => (on ? "on" : "off");
  const SWITCHES: {
    label: string;
    tab: "This insert" | "My printer";
    /** The settings with only this switch away from its default. */
    changed: Settings;
    /** What the way back says: the switch's default. */
    to: string;
  }[] = [
    {
      label: "Room for fingers",
      tab: "This insert",
      changed: applyFingerRoom(DEFAULT_SETTINGS, true),
      to: "off",
    },
    {
      label: "Rim between layers",
      tab: "This insert",
      changed: {
        ...DEFAULT_SETTINGS,
        lip: { ...DEFAULT_SETTINGS.lip, enabled: !DEFAULT_SETTINGS.lip.enabled },
      },
      to: word(DEFAULT_SETTINGS.lip.enabled),
    },
    {
      label: "Fill to the lid",
      tab: "This insert",
      changed: { ...DEFAULT_SETTINGS, fillToTop: !DEFAULT_SETTINGS.fillToTop },
      to: word(DEFAULT_SETTINGS.fillToTop),
    },
    {
      label: "Engrave tray names",
      tab: "My printer",
      changed: { ...DEFAULT_SETTINGS, engraveNames: !DEFAULT_SETTINGS.engraveNames },
      to: word(DEFAULT_SETTINGS.engraveNames),
    },
    {
      label: "Join spacers into fewer pieces to print",
      tab: "My printer",
      changed: { ...DEFAULT_SETTINGS, mergeFillers: !DEFAULT_SETTINGS.mergeFillers },
      to: word(DEFAULT_SETTINGS.mergeFillers),
    },
    {
      label: "Fold risers into the joined spacers",
      tab: "My printer",
      changed: { ...DEFAULT_SETTINGS, mergeRisers: !DEFAULT_SETTINGS.mergeRisers },
      to: word(DEFAULT_SETTINGS.mergeRisers),
    },
  ];

  /** The switch's row: its checkbox, its dot, and the button that puts it back. */
  function open(label: string, tabName: "This insert" | "My printer") {
    if (tabName === "My printer") {
      fireEvent.click(tab(/^My printer/));
    }
    if (label === "Fold risers into the joined spacers") {
      // it sits in Printer details
      fireEvent.click(screen.getByRole("button", { name: /^Printer details/ }));
    }
    const box = screen.getByRole("checkbox", { name: label });
    const wrap = box.closest(".st-switch") as HTMLElement;
    return {
      box,
      wrap,
      dot: wrap?.querySelector(".k-check__dot") ?? null,
      back: within(wrap).queryByRole("button", { name: /^Back to/ }),
    };
  }

  it.each(SWITCHES)(
    "$label: a dot and Back to $to once changed, and neither at its default",
    (sw) => {
      const view = sheet({ settings: sw.changed });
      const changed = open(sw.label, sw.tab);
      expect(changed.dot, "the dot").not.toBeNull();
      expect(changed.back, "the way back").not.toBeNull();
      expect(changed.back?.textContent).toBe(`Back to ${sw.to}`);
      expect(changed.back?.getAttribute("aria-label")).toBe(`Back to ${sw.to} for ${sw.label}`);
      view.view.unmount();
      sheet({ settings: DEFAULT_SETTINGS });
      const plain = open(sw.label, sw.tab);
      expect(plain.dot).toBeNull();
      expect(plain.back).toBeNull();
    },
  );

  it.each(SWITCHES)("$label: Back puts only this switch back, and the focus stays on it", (sw) => {
    const { props } = sheet({ settings: sw.changed });
    const row = open(sw.label, sw.tab);
    fireEvent.click(row.back as HTMLElement);
    expect(props.onSettingsChange).toHaveBeenCalledTimes(1);
    expect(props.onSettingsChange).toHaveBeenLastCalledWith(DEFAULT_SETTINGS);
    expect(document.activeElement).toBe(row.box);
  });

  it("a closed Printer details says when the riser fold inside it was changed", () => {
    sheet({ settings: { ...DEFAULT_SETTINGS, mergeRisers: true } });
    fireEvent.click(tab(/^My printer/));
    const row = screen.getByRole("button", { name: /^Printer details/ });
    expect(row.textContent).toBe("Printer details1 changed");
    cleanup();
    sheet();
    fireEvent.click(tab("My printer"));
    expect(screen.getByRole("button", { name: /^Printer details/ }).textContent).toMatch(
      /margin, .* mm layers$/,
    );
  });

  it("Back on Room for fingers puts both of its numbers back", () => {
    const { props } = sheet({ settings: { ...applyFingerRoom(DEFAULT_SETTINGS, true), wall: 2 } });
    fireEvent.click(screen.getByRole("button", { name: "Back to off for Room for fingers" }));
    expect(props.onSettingsChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, wall: 2 });
  });

  it("counts Room for fingers once in the header, and every switch once", () => {
    sheet({ settings: applyFingerRoom(DEFAULT_SETTINGS, true) });
    const head = document.querySelector(".st-head") as HTMLElement;
    expect(within(head).getByText("1 changed")).toBeTruthy();
  });

  it("the header count is the number of Back buttons and dots a person can find, switches and numbers", () => {
    const settings: Settings = {
      ...applyFingerRoom(DEFAULT_SETTINGS, true),
      fillToTop: false,
      wall: 2,
      engraveNames: false,
    };
    sheet({ settings });
    const head = document.querySelector(".st-head") as HTMLElement;
    expect(within(head).getByText("4 changed")).toBeTruthy();
    // This insert: the switches' dots (fingers, fill) and the wall's own, in its group
    const insert = screen.getByRole("dialog");
    expect(insert.querySelectorAll(".st-switch .k-check__dot")).toHaveLength(2);
    fireEvent.click(tab(/^My printer/));
    expect(insert.querySelectorAll(".st-switch .k-check__dot")).toHaveLength(1);
  });
});

describe("the tabs say where a changed setting is", () => {
  it("puts a dot on the tab whose settings differ, and says so to a reader", () => {
    sheet({ settings: { ...DEFAULT_SETTINGS, wall: 1.8 } });
    expect(tab("This insert, changed")).toBeTruthy();
    expect(tab("My printer")).toBeTruthy();
    expect(document.querySelectorAll(".st-tabs .k-seg__dot")).toHaveLength(1);
  });

  it("marks My printer when only a printing option changed", () => {
    sheet({ settings: { ...DEFAULT_SETTINGS, engraveNames: false } });
    expect(tab("This insert")).toBeTruthy();
    expect(tab("My printer, changed")).toBeTruthy();
    expect(document.querySelectorAll(".st-tabs .k-seg__dot")).toHaveLength(1);
  });

  it("marks both tabs when both differ, and neither at the defaults", () => {
    sheet({ settings: { ...DEFAULT_SETTINGS, wall: 1.8, mergeRisers: true } });
    expect(tab("This insert, changed")).toBeTruthy();
    expect(tab("My printer, changed")).toBeTruthy();
    cleanup();
    sheet();
    expect(document.querySelectorAll(".st-tabs .k-seg__dot")).toHaveLength(0);
  });

  it("keeps an error's mark on a tab that has one", () => {
    sheet({ settings: { ...DEFAULT_SETTINGS, wall: 1.8 } }, [error("/settings/wall")]);
    expect(tab("This insert, needs attention")).toBeTruthy();
    expect(document.querySelectorAll(".st-tabs .k-seg__dot")).toHaveLength(1);
  });

  it("leaves My printer's own values (bed, margin) out: they are not in the count", () => {
    sheet({ myPrinter: MINE });
    expect(document.querySelectorAll(".st-tabs .k-seg__dot")).toHaveLength(0);
    expect(screen.queryByText(/ changed$/)).toBeNull();
  });
});
