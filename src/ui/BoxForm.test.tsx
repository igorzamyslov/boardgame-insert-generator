// src/ui/BoxForm.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOX, DEFAULT_PRINTER } from "../model/defaults";
import { BoxForm } from "./BoxForm";
import { PrinterForm, bedPresetOf } from "./PrinterForm";

afterEach(cleanup);

describe("BoxForm", () => {
  it("labels every field and commits decimal-comma input", () => {
    const onChange = vi.fn();
    render(<BoxForm box={DEFAULT_BOX} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/Inner width/), { target: { value: "290,5" } });
    expect(onChange).toHaveBeenCalledWith({ innerWidth: 290.5 });
    expect(screen.getByLabelText(/Inner depth/)).toBeTruthy();
    expect(screen.getByLabelText(/Inner height/)).toBeTruthy();
    expect(screen.getAllByText(/narrowest point/)).toHaveLength(2);
    expect(screen.getByText(/plus 1 mm for warp/)).toBeTruthy();
  });

  it("hides headroom coverage when headroom is 0", () => {
    const view = render(<BoxForm box={{ ...DEFAULT_BOX, headroom: 0 }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/cover every tray/)).toBeNull();
    view.rerender(<BoxForm box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/cover every tray/)).toBeTruthy();
  });

  it("toggles stored-on-side and coverage", () => {
    const onChange = vi.fn();
    render(<BoxForm box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/stored on its side/));
    expect(onChange).toHaveBeenCalledWith({ storedOnSide: true });
    fireEvent.change(screen.getByLabelText(/cover every tray/), { target: { value: "partial" } });
    expect(onChange).toHaveBeenCalledWith({ headroomCoverage: "partial" });
  });
});

describe("PrinterForm", () => {
  it("recognizes presets and applies a picked preset", () => {
    expect(bedPresetOf(DEFAULT_PRINTER)).toBe("bambu-256");
    expect(bedPresetOf({ ...DEFAULT_PRINTER, bedX: 300 })).toBe("custom");
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} advanced={false} onChange={onChange} />);
    expect(screen.queryByLabelText(/Bed X/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Printer bed"), { target: { value: "prusa-mk4" } });
    expect(onChange).toHaveBeenCalledWith({ bedX: 250, bedY: 210, bedZ: 220 });
  });

  it("shows X/Y/Z for a custom bed", () => {
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} advanced={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Printer bed"), { target: { value: "custom" } });
    fireEvent.input(screen.getByLabelText(/Bed X/), { target: { value: "300" } });
    expect(onChange).toHaveBeenCalledWith({ bedX: 300 });
    expect(screen.getByLabelText(/Bed Y/)).toBeTruthy();
    expect(screen.getByLabelText(/Bed Z/)).toBeTruthy();
  });

  it("shows bed margin and layer height only in advanced mode", () => {
    const view = render(
      <PrinterForm printer={DEFAULT_PRINTER} advanced={false} onChange={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/Bed margin/)).toBeNull();
    view.rerender(<PrinterForm printer={DEFAULT_PRINTER} advanced onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Bed margin/)).toBeTruthy();
    expect(screen.getByLabelText(/Layer height/)).toBeTruthy();
  });
});
