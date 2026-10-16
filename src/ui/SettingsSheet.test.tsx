// src/ui/SettingsSheet.test.tsx
// @vitest-environment jsdom
import { useState } from "preact/hooks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRINTER } from "../model/defaults";
import { DEFAULT_SETTINGS, applyWallChoice } from "../model/settings";
import type { Notice, Printer } from "../model/types";
import { SETTING_RANGES } from "../model/validate";
import { SettingsSheet, settingsTabFor } from "./SettingsSheet";
import type { SettingsSheetProps } from "./SettingsSheet";
import { ValidationContext } from "./validation";

afterEach(cleanup);

const MINE: Printer = { ...DEFAULT_PRINTER, bedX: 180, bedY: 180, bedZ: 180 };

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
  return { props, view, again: (n: Notice[]) => view.rerender(ui(props, n)) };
}

const tab = (name: string): HTMLElement => screen.getByRole("tab", { name });
const selected = (): string[] =>
  screen
    .getAllByRole("tab")
    .filter((t) => t.getAttribute("aria-selected") === "true")
    .map((t) => t.textContent ?? "");

const error = (path: string, message = "Something is wrong."): Notice => ({
  level: "error",
  code: "field.test",
  message,
  path,
});

describe("SettingsSheet", () => {
  it("is a modal dialog named Settings with two tabs", () => {
    sheet();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("tablist", { name: "Settings" })).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "This insert",
      "My printer",
    ]);
    // starts at the heading, like the export dialog
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Settings" }));
  });

  it("every setting is reachable", () => {
    sheet({ myPrinter: { ...MINE, bedX: 123 } });
    // This insert: the simple choices, the checks, and every exact number
    for (const name of ["Fit", "Walls", "Unused space"]) {
      expect(screen.getByRole("combobox", { name }), name).toBeTruthy();
    }
    for (const name of [
      "Room for fingers",
      "Rim between layers",
      "Fill to the lid",
      "One thick wall instead of a spacer",
    ]) {
      expect(screen.getByRole("checkbox", { name }), name).toBeTruthy();
    }
    expect(screen.getByRole("searchbox", { name: "Search exact numbers" })).toBeTruthy();
    for (const r of SETTING_RANGES) {
      // a unit is part of a number's name: "Wall (mm)"
      const label = new RegExp(`^${r.label.replace(/[()]/g, "\\$&")}( \\((mm|%)\\))?$`);
      expect(screen.getAllByLabelText(label).length, r.path).toBeGreaterThan(0);
    }
    // My printer: the preference, the options that only change the printing
    fireEvent.click(tab("My printer"));
    expect(screen.getByRole("combobox", { name: "Print bed" })).toBeTruthy();
    // a bed that matches no preset shows its three sizes
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
    expect(screen.getByRole("button", { name: "Apply to this insert" })).toBeTruthy();
  });

  it("Walls shows Custom when it matches no preset", () => {
    const view = sheet({ settings: { ...DEFAULT_SETTINGS, wall: 1.8 } });
    const walls = screen.getByRole("combobox", { name: "Walls" }) as HTMLSelectElement;
    expect(walls.value).toBe("custom");
    expect(within(walls).getByRole("option", { name: "Custom (1.8 mm)" })).toBeTruthy();
    view.view.unmount();
    sheet({ settings: applyWallChoice(DEFAULT_SETTINGS, "sturdy") });
    const again = screen.getByRole("combobox", { name: "Walls" }) as HTMLSelectElement;
    expect(again.value).toBe("sturdy");
    expect(within(again).queryByRole("option", { name: /^Custom/ })).toBeNull();
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

  describe("tabs", () => {
    it("wire each tab to its panel and move with the arrow keys", () => {
      sheet();
      expect(selected()).toEqual(["This insert"]);
      const panel = screen.getByRole("tabpanel");
      expect(panel.getAttribute("aria-labelledby")).toBe(tab("This insert").id);
      expect(tab("This insert").getAttribute("aria-controls")).toBe(panel.id);
      expect(tab("This insert").tabIndex).toBe(0);
      expect(tab("My printer").tabIndex).toBe(-1);
      fireEvent.keyDown(tab("This insert"), { key: "ArrowRight" });
      expect(selected()).toEqual(["My printer"]);
      expect(document.activeElement).toBe(tab("My printer"));
      expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
        tab("My printer").id,
      );
      fireEvent.keyDown(tab("My printer"), { key: "ArrowRight" });
      expect(selected()).toEqual(["This insert"]);
      fireEvent.keyDown(tab("This insert"), { key: "End" });
      expect(selected()).toEqual(["My printer"]);
      fireEvent.keyDown(tab("My printer"), { key: "Home" });
      expect(selected()).toEqual(["This insert"]);
      fireEvent.keyDown(tab("This insert"), { key: "ArrowLeft" });
      expect(selected()).toEqual(["My printer"]);
    });

    it("start on the tab the person asked for", () => {
      sheet({ initialTab: "printer" });
      expect(selected()).toEqual(["My printer"]);
    });
  });

  describe("an error", () => {
    it("in a setting opens This insert with Exact numbers open", () => {
      sheet({}, [error("/settings/bottomChamfer", "Bottom chamfer is too big")]);
      expect(selected()).toEqual(["This insert, needs attention"]);
      expect((document.querySelector("details.pf-disc") as HTMLDetailsElement).open).toBe(true);
      expect(screen.getByText("Bottom chamfer is too big")).toBeTruthy();
    });

    it("in the insert's printer opens My printer and says what is wrong", () => {
      sheet({}, [error("/printer/bedMargin", "Bed margin leaves no room.")]);
      expect(selected()).toEqual(["My printer, needs attention"]);
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
      fireEvent.click(tab("My printer"));
      view.again([error("/settings/wall")]);
      expect(selected()).toEqual(["My printer"]);
      expect(tab("This insert, needs attention")).toBeTruthy();
    });
  });

  describe("My printer", () => {
    const open = (over: Partial<SettingsSheetProps> = {}) => {
      const view = sheet(over);
      fireEvent.click(tab("My printer"));
      return view;
    };

    it("saves a change as the preference, leaving this insert to Apply", () => {
      const { props } = open();
      fireEvent.input(screen.getByLabelText(/^Bed margin/), { target: { value: "8" } });
      expect(props.onMyPrinterChange).toHaveBeenLastCalledWith({
        ...DEFAULT_PRINTER,
        bedMargin: 8,
      });
      expect(props.onApplyPrinter).not.toHaveBeenCalled();
    });

    it("does not save a printer that cannot work, and says so", () => {
      const { props } = open();
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

    it("applies my printer to this insert when it differs, and says when it does not", () => {
      const { props } = open({ myPrinter: MINE });
      expect(screen.getByText(/This insert is planned for 256 × 256 × 256 mm bed/)).toBeTruthy();
      // the overwrite is stated
      expect(screen.getByText(/Applying replaces it\./)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply to this insert" }));
      expect(props.onApplyPrinter).toHaveBeenCalledTimes(1);
      cleanup();
      const same = open();
      const apply = screen.getByRole("button", { name: "Apply to this insert" });
      expect(apply.getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByText("This insert already uses this printer.")).toBeTruthy();
      fireEvent.click(apply);
      expect(same.props.onApplyPrinter).not.toHaveBeenCalled();
    });

    it("edits this insert's printing options", () => {
      const { props } = open();
      fireEvent.click(screen.getByRole("checkbox", { name: "Engrave tray names" }));
      expect(props.onSettingsChange).toHaveBeenLastCalledWith({
        ...DEFAULT_SETTINGS,
        engraveNames: false,
      });
    });
  });

  it("edits this insert's settings from the first tab", () => {
    const { props } = sheet();
    fireEvent.change(screen.getByRole("combobox", { name: "Walls" }), {
      target: { value: "sturdy" },
    });
    expect(props.onSettingsChange).toHaveBeenLastCalledWith(
      applyWallChoice(DEFAULT_SETTINGS, "sturdy"),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Rim between layers" }));
    expect(props.onSettingsChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: true },
    });
  });
});
