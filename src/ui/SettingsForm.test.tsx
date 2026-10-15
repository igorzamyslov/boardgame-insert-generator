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
import { SettingsForm, changedRanges, restoreAllExact } from "./SettingsForm";
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

  describe("settings that differ from their defaults", () => {
    const changedFrom = (over: Partial<typeof DEFAULT_SETTINGS>) => ({
      ...DEFAULT_SETTINGS,
      ...over,
    });
    const field = (label: RegExp) => screen.getByLabelText(label).closest(".field") as HTMLElement;

    it("marks nothing, and offers no restore, when every value is the default", () => {
      const view = render(<SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={vi.fn()} />);
      expect(view.container.querySelector(".field-changed")).toBeNull();
      expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
      expect(view.container.querySelector(".pf-disc .pf-count")).toBeNull();
      expect(changedRanges(DEFAULT_SETTINGS)).toEqual([]);
    });

    it("marks only the changed field, says its default, and restores just that one", () => {
      const onChange = vi.fn();
      const s = changedFrom({ cornerRadius: 4.5, trayGap: 0.4 });
      const view = render(<SettingsForm settings={s} advanced onChange={onChange} />);
      const marked = [...view.container.querySelectorAll(".field-changed")];
      expect(marked).toHaveLength(2);
      const corner = field(/^Corner radius/);
      expect(corner.querySelector(".field-changed")?.textContent).toContain(
        "Changed from the default, 3 mm.",
      );
      // an untouched field carries no mark
      expect(field(/^Box clearance/).querySelector(".field-changed")).toBeNull();
      fireEvent.click(
        within(corner).getByRole("button", { name: "Restore the default for Corner radius" }),
      );
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith({
        ...s,
        cornerRadius: DEFAULT_SETTINGS.cornerRadius,
      });
    });

    it("restores a nested value (the lip's play) and a unitless one (Fit)", () => {
      const onChange = vi.fn();
      const s = changedFrom({ fit: 1.4, lip: { ...DEFAULT_SETTINGS.lip, play: 0.4 } });
      render(<SettingsForm settings={s} advanced onChange={onChange} />);
      expect(field(/^Lip play/).textContent).toContain("Changed from the default, 0.25 mm.");
      fireEvent.click(screen.getByRole("button", { name: "Restore the default for Lip play" }));
      expect(onChange).toHaveBeenLastCalledWith({ ...s, lip: { ...s.lip, play: 0.25 } });
      const fit = screen
        .getAllByLabelText(/^Fit/)
        .map((el) => el.closest(".field"))
        .find((el) => el?.querySelector(".field-changed"));
      expect(fit?.textContent).toContain("Changed from the default, 1.");
    });

    it("counts the changed values on the collapsed panel", () => {
      const view = render(
        <SettingsForm
          settings={changedFrom({ cornerRadius: 4.5, trayGap: 0.4, wall: 2 })}
          advanced
          onChange={vi.fn()}
        />,
      );
      const summary = view.container.querySelector("details.pf-disc > summary");
      expect(summary?.textContent).toBe("Exact values3 changed");
      expect(view.container.querySelector("details.pf-disc")?.hasAttribute("open")).toBe(false);
    });

    it("counts a choice made in the simple controls, which write the same numbers", () => {
      const view = render(
        <SettingsForm
          settings={applyWallChoice(DEFAULT_SETTINGS, "sturdy")}
          advanced
          onChange={vi.fn()}
        />,
      );
      expect(view.container.querySelector("details.pf-disc .pf-count")?.textContent).toBe(
        "1 changed",
      );
    });

    it("asks before restoring everything, and keeps the values when you decline", () => {
      const onChange = vi.fn();
      const s = changedFrom({ cornerRadius: 4.5, trayGap: 0.4 });
      render(<SettingsForm settings={s} advanced onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", { name: "Restore all exact values" }));
      // the first press discards nothing
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText(/Put 2 values back to their defaults\?/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Keep my values" }));
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Restore all exact values" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Restore all exact values" }));
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(DEFAULT_SETTINGS);
    });

    it("restores every exact value but leaves the choices outside the panel alone", () => {
      const s = changedFrom({
        wall: 2,
        fit: 1.4,
        lip: { ...DEFAULT_SETTINGS.lip, enabled: true, height: 3 },
        fingerPocket: { ...DEFAULT_SETTINGS.fingerPocket, width: 30 },
        leftover: "solid",
        mergeFillers: false,
        fillToTop: false,
        wallAbsorb: 1,
        playLimit: 2,
      });
      expect(restoreAllExact(s)).toEqual({
        ...DEFAULT_SETTINGS,
        lip: { ...DEFAULT_SETTINGS.lip, enabled: true },
        leftover: "solid",
        mergeFillers: false,
        fillToTop: false,
        wallAbsorb: 1,
      });
      expect(restoreAllExact(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    });

    it("does not mark the wall absorption control, which sits outside the panel", () => {
      const view = render(
        <SettingsForm settings={changedFrom({ wallAbsorb: 1 })} advanced onChange={vi.fn()} />,
      );
      expect(view.container.querySelector(".field-changed")).toBeNull();
      expect(view.container.querySelector(".pf-count")).toBeNull();
    });

    it("offers the play limit among the exact values, with its hint", () => {
      const onChange = vi.fn();
      const view = render(
        <SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={onChange} />,
      );
      const input = screen.getByLabelText(/^Play limit/);
      expect(view.container.querySelector("details.pf-disc")?.contains(input)).toBe(true);
      fireEvent.input(input, { target: { value: "2,5" } });
      expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, playLimit: 2.5 });
    });
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

  it("offers the two merge switches in advanced mode only: fillers on, risers off by default", () => {
    const onChange = vi.fn();
    const view = render(<SettingsForm settings={DEFAULT_SETTINGS} advanced onChange={onChange} />);
    const fillers = screen.getByLabelText("Merge fillers into one part") as HTMLInputElement;
    const risers = screen.getByLabelText("Fold risers into the merged fillers") as HTMLInputElement;
    expect(fillers.checked).toBe(true);
    expect(risers.checked).toBe(false);
    fireEvent.click(fillers);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, mergeFillers: false });
    fireEvent.click(risers);
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, mergeRisers: true });
    view.unmount();
    // the riser switch does nothing while fillers are not merged, so it cannot be ticked
    render(
      <SettingsForm
        settings={{ ...DEFAULT_SETTINGS, mergeFillers: false }}
        advanced
        onChange={onChange}
      />,
    );
    expect(
      (screen.getByLabelText("Fold risers into the merged fillers") as HTMLInputElement).disabled,
    ).toBe(true);
    cleanup();
    render(<SettingsForm settings={DEFAULT_SETTINGS} advanced={false} onChange={onChange} />);
    expect(screen.queryByLabelText("Merge fillers into one part")).toBeNull();
    expect(screen.queryByLabelText("Fold risers into the merged fillers")).toBeNull();
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
