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
import { SettingsForm } from "./SettingsForm";
import { SETTING_SETTERS, settingUnit } from "./settingsFields";

afterEach(cleanup);

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

describe("SettingsForm", () => {
  it("writes resolved values from the simple choices", () => {
    const onChange = vi.fn();
    render(<SettingsForm settings={DEFAULT_SETTINGS} advanced={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Walls"), { target: { value: "sturdy" } });
    expect(onChange).toHaveBeenCalledWith(applyWallChoice(DEFAULT_SETTINGS, "sturdy"));
    fireEvent.change(screen.getByLabelText("Fit"), { target: { value: "loose" } });
    expect(onChange).toHaveBeenCalledWith(applyFitChoice(DEFAULT_SETTINGS, "loose"));
    fireEvent.click(screen.getByLabelText("Extra finger room in the box"));
    expect(onChange).toHaveBeenCalledWith(applyFingerRoom(DEFAULT_SETTINGS, true));
    expect(screen.queryByLabelText(/Corner radius/)).toBeNull();
  });

  it("shows a custom finger room as on, names it, and switches it off", () => {
    const onChange = vi.fn();
    const four = {
      ...DEFAULT_SETTINGS,
      fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, wallRoom: 4 },
    };
    render(<SettingsForm settings={four} advanced={false} onChange={onChange} />);
    const box = screen.getByLabelText("Extra finger room in the box");
    if (!(box instanceof HTMLInputElement)) {
      throw new Error("not a checkbox");
    }
    expect(box.checked).toBe(true);
    expect(screen.getByText(/Custom: 4 mm walls, 0 mm dividers/)).toBeTruthy();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(applyFingerRoom(four, false));
  });

  it("shows a custom choice when advanced values match no preset", () => {
    render(
      <SettingsForm
        settings={{ ...DEFAULT_SETTINGS, wall: 1.8 }}
        advanced={false}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("Walls");
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error("not a select");
    }
    expect(select.value).toBe("custom");
    expect(screen.getByRole("option", { name: "Custom (1.8 mm)" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("keeps the simple choices in advanced mode and tucks the exact numbers into a disclosure", () => {
    const onChange = vi.fn();
    const view = render(<SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={onChange} />);
    expect(screen.getByLabelText("Walls")).toBeTruthy();
    // the exact "Fit" number has the same label, so tell the choice apart by its role
    expect(screen.getByRole("combobox", { name: "Fit" })).toBeTruthy();
    expect(screen.getByLabelText("Extra finger room in the box")).toBeTruthy();
    const disc = view.container.querySelector("details.pf-disc");
    expect(disc?.querySelector("summary")?.textContent).toBe("Exact values");
    expect(disc?.hasAttribute("open")).toBe(false);
    // the numeric fields are inside the disclosure, the lip and leftover are not
    expect(disc?.contains(screen.getByLabelText(/^Corner radius/))).toBe(true);
    expect(disc?.contains(screen.getByLabelText(/Locating lip/))).toBe(false);
    expect(disc?.contains(screen.getByLabelText("Unused space"))).toBe(false);
    fireEvent.change(screen.getByLabelText("Walls"), { target: { value: "sturdy" } });
    expect(onChange).toHaveBeenLastCalledWith(applyWallChoice(DEFAULT_SETTINGS, "sturdy"));
  });

  it("describes every exact value and wires the hint to its input", () => {
    const view = render(<SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={vi.fn()} />);
    const disc = view.container.querySelector("details.pf-disc");
    // wallAbsorb sits beside "Unused space", not under Exact values (tested below).
    for (const r of SETTING_RANGES.filter((x) => x.path !== "wallAbsorb")) {
      const input = disc?.querySelector(`#settings-${r.path.replace("/", "-")}`);
      const hint = document.getElementById(`${input?.id}-hint`);
      expect(hint?.textContent, r.path).toBe(r.hint);
      expect(input?.getAttribute("aria-describedby"), r.path).toContain(`${input?.id}-hint`);
    }
  });

  it("puts the wall absorption control beside Unused space in advanced mode only, with its hint", () => {
    const onChange = vi.fn();
    const view = render(<SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={onChange} />);
    const disc = view.container.querySelector("details.pf-disc");
    const input = screen.getByLabelText(/^Thicker walls instead of a filler/);
    expect(disc?.contains(input)).toBe(false);
    const range = SETTING_RANGES.find((r) => r.path === "wallAbsorb");
    expect(document.getElementById("settings-wallAbsorb-hint")?.textContent).toBe(range?.hint);
    fireEvent.input(input, { target: { value: "1,5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, wallAbsorb: 1.5 });
    cleanup();
    render(<SettingsForm settings={DEFAULT_SETTINGS} advanced={false} onChange={onChange} />);
    expect(screen.queryByLabelText(/^Thicker walls instead of a filler/)).toBeNull();
  });

  it("edits every advanced number, the lip and the leftover", () => {
    const onChange = vi.fn();
    const view = render(<SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={onChange} />);
    const exactValues = within(view.container.querySelector("details.pf-disc") as HTMLElement);
    for (const r of SETTING_RANGES.filter((x) => x.path !== "wallAbsorb")) {
      const exact = new RegExp(`^${r.label.replace(/[()]/g, "\\$&")}( \\((mm|%)\\))?$`);
      expect(exactValues.getByLabelText(exact), r.path).toBeTruthy();
    }
    fireEvent.input(screen.getByLabelText(/^Corner radius/), { target: { value: "4,5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, cornerRadius: 4.5 });
    fireEvent.input(screen.getByLabelText(/^Lip play/), { target: { value: "0,3" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, play: 0.3 },
    });
    // The lip starts off, so ticking the box turns it on.
    fireEvent.click(screen.getByLabelText(/Locating lip/));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_SETTINGS,
      lip: { ...DEFAULT_SETTINGS.lip, enabled: true },
    });
    fireEvent.change(screen.getByLabelText("Unused space"), { target: { value: "solid" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, leftover: "solid" });
  });

  it("offers Fill the box to the top in advanced mode only, on by default", () => {
    const onChange = vi.fn();
    const view = render(<SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={onChange} />);
    const box = screen.getByLabelText("Fill the box to the top") as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(view.container.textContent).toContain("so every stack reaches the lid");
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, fillToTop: false });
    view.unmount();
    render(<SettingsForm settings={DEFAULT_SETTINGS} advanced={false} onChange={onChange} />);
    expect(screen.queryByLabelText("Fill the box to the top")).toBeNull();
  });

  it.each([
    ["field.bottomChamfer", "Bottom chamfer is more than the walls allow."],
    ["field.lipBearing", "The lip would not rest on the ledge."],
  ])("shows %s beside the bottom chamfer field", (code, message) => {
    render(
      <ValidationContext.Provider
        value={[{ level: "error", code, path: "/settings/bottomChamfer", message }]}
      >
        <SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    const field = screen.getByLabelText(/^Bottom chamfer/);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toContain(alert.id);
  });
});
