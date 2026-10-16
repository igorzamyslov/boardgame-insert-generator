// src/ui/BoxPanel.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOX } from "../model/defaults";
import { BoxPanel } from "./BoxPanel";
import { ValidationContext } from "./validation";

afterEach(cleanup);

describe("BoxPanel", () => {
  it("labels the size fields and commits decimal-comma input", () => {
    const onChange = vi.fn();
    render(<BoxPanel box={DEFAULT_BOX} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "290,5" } });
    expect(onChange).toHaveBeenCalledWith({ innerWidth: 290.5 });
    expect(screen.getByLabelText(/^Length/)).toBeTruthy();
    // front to back is "length", not "depth", which reads as vertical
    expect(screen.queryByLabelText(/^Depth/)).toBeNull();
    expect(screen.getByText(/length front to back/)).toBeTruthy();
    expect(screen.getByLabelText(/^Height/)).toBeTruthy();
    expect(screen.getAllByText(/narrowest point/)).toHaveLength(1);
  });

  it("box headroom is always visible", () => {
    const view = render(<BoxPanel box={{ ...DEFAULT_BOX, headroom: 0 }} onChange={vi.fn()} />);
    for (const box of [
      { ...DEFAULT_BOX, headroom: 0 },
      { ...DEFAULT_BOX, headroom: 8 },
    ]) {
      view.rerender(<BoxPanel box={box} onChange={vi.fn()} />);
      expect(screen.getByLabelText(/^Keep space free on top/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Whole top" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Part of it" })).toBeTruthy();
      expect(screen.getByLabelText(/stored on its side/)).toBeTruthy();
    }
    // the old name is gone
    expect(screen.queryByLabelText(/^Headroom/)).toBeNull();
    expect(screen.queryByLabelText("Covered by boards")).toBeNull();
  });

  it("commits the space kept free on top, in mm", () => {
    const onChange = vi.fn();
    render(<BoxPanel box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={onChange} />);
    expect(screen.getByText(/plus 1 mm for warp/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText(/^Keep space free on top/), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({ headroom: 5 });
  });

  it("switches between Whole top and Part of it with pressed buttons", () => {
    const onChange = vi.fn();
    const view = render(<BoxPanel box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={onChange} />);
    const whole = (): string | null =>
      screen.getByRole("button", { name: "Whole top" }).getAttribute("aria-pressed");
    const part = (): string | null =>
      screen.getByRole("button", { name: "Part of it" }).getAttribute("aria-pressed");
    expect([whole(), part()]).toEqual(["true", "false"]);
    fireEvent.click(screen.getByRole("button", { name: "Part of it" }));
    expect(onChange).toHaveBeenCalledWith({ headroomCoverage: "partial" });
    view.rerender(
      <BoxPanel
        box={{ ...DEFAULT_BOX, headroom: 8, headroomCoverage: "partial" }}
        onChange={onChange}
      />,
    );
    expect([whole(), part()]).toEqual(["false", "true"]);
    fireEvent.click(screen.getByRole("button", { name: "Whole top" }));
    expect(onChange).toHaveBeenCalledWith({ headroomCoverage: "full" });
  });

  it("mutes Whole top and Part of it at 0 mm, still visible and focusable", () => {
    const onChange = vi.fn();
    const view = render(<BoxPanel box={{ ...DEFAULT_BOX, headroom: 0 }} onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Covers" })).toBeTruthy();
    for (const name of ["Whole top", "Part of it"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.disabled).toBe(false);
      button.focus();
      expect(document.activeElement).toBe(button);
    }
    fireEvent.click(screen.getByRole("button", { name: "Part of it" }));
    expect(onChange).not.toHaveBeenCalled();
    view.rerender(<BoxPanel box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Part of it" }).hasAttribute("aria-disabled")).toBe(
      false,
    );
  });

  it("toggles stored-on-side", () => {
    const onChange = vi.fn();
    render(<BoxPanel box={DEFAULT_BOX} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/stored on its side/));
    expect(onChange).toHaveBeenCalledWith({ storedOnSide: true });
  });

  it("says no bits and keeps every field's error in sight, outside any fold", () => {
    render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.length",
            path: "/box/headroom",
            message: "Use 0 mm or more.",
          },
          { level: "error", code: "field.length", path: "/box/innerHeight", message: "Use 70 mm." },
        ]}
      >
        <BoxPanel box={DEFAULT_BOX} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    expect(screen.getByText("Use 0 mm or more.")).toBeTruthy();
    expect(screen.getByText("Use 70 mm.")).toBeTruthy();
    expect(document.querySelector("details")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bbits?\b/i);
  });
});
