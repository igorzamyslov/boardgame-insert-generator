// src/ui/BoxForm.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOX, DEFAULT_PRINTER } from "../model/defaults";
import { BoxForm } from "./BoxForm";
import { PrinterForm, bedPresetOf } from "./PrinterForm";

afterEach(cleanup);

describe("BoxForm", () => {
  it("labels the size fields and commits decimal-comma input", () => {
    const onChange = vi.fn();
    render(<BoxForm box={DEFAULT_BOX} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "290,5" } });
    expect(onChange).toHaveBeenCalledWith({ innerWidth: 290.5 });
    expect(screen.getByLabelText(/^Length/)).toBeTruthy();
    // front to back is "length", not "depth", which reads as vertical
    expect(screen.queryByLabelText(/^Depth/)).toBeNull();
    expect(screen.getByText(/length front to back/)).toBeTruthy();
    expect(screen.getByLabelText(/^Height/)).toBeTruthy();
    expect(screen.getAllByText(/narrowest point/)).toHaveLength(1);
  });

  it("offers headroom and the side-storage switch beside the size fields", () => {
    const onChange = vi.fn();
    render(<BoxForm box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={onChange} />);
    expect(screen.getByLabelText(/^Headroom/)).toBeTruthy();
    expect(screen.getByLabelText(/stored on its side/)).toBeTruthy();
    expect(screen.getByText(/plus 1 mm for warp/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText(/^Headroom/), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({ headroom: 5 });
  });

  it("hides headroom coverage when headroom is 0", () => {
    const view = render(<BoxForm box={{ ...DEFAULT_BOX, headroom: 0 }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Covered by boards")).toBeNull();
    view.rerender(<BoxForm box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Covered by boards")).toBeTruthy();
  });

  it("toggles stored-on-side and coverage", () => {
    const onChange = vi.fn();
    render(<BoxForm box={{ ...DEFAULT_BOX, headroom: 8 }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/stored on its side/));
    expect(onChange).toHaveBeenCalledWith({ storedOnSide: true });
    fireEvent.change(screen.getByLabelText("Covered by boards"), { target: { value: "partial" } });
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
    fireEvent.change(screen.getByLabelText("Print bed"), { target: { value: "prusa-mk4" } });
    expect(onChange).toHaveBeenCalledWith({ bedX: 250, bedY: 210, bedZ: 220 });
  });

  it("shows X/Y/Z for a custom bed", () => {
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} advanced={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Print bed"), { target: { value: "custom" } });
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

describe("PrinterForm custom bed", () => {
  it("drops a custom choice when another project's preset bed is loaded", () => {
    const view = render(
      <PrinterForm printer={DEFAULT_PRINTER} advanced={false} onChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Print bed"), { target: { value: "custom" } });
    expect(screen.getByLabelText(/Bed X/)).toBeTruthy();
    view.rerender(
      <PrinterForm
        printer={{ ...DEFAULT_PRINTER, bedX: 250, bedY: 210, bedZ: 220 }}
        advanced={false}
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Print bed") as HTMLSelectElement).value).toBe("prusa-mk4");
    expect(screen.queryByLabelText(/Bed X/)).toBeNull();
  });

  it("keeps the fields while the user types a size that equals a preset", () => {
    function Harness() {
      const [printer, setPrinter] = useState(DEFAULT_PRINTER);
      return (
        <PrinterForm
          printer={printer}
          advanced={false}
          onChange={(patch) => setPrinter((p) => ({ ...p, ...patch }))}
        />
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Print bed"), { target: { value: "custom" } });
    fireEvent.input(screen.getByLabelText(/Bed X/), { target: { value: "250" } });
    fireEvent.input(screen.getByLabelText(/Bed Y/), { target: { value: "210" } });
    fireEvent.input(screen.getByLabelText(/Bed Z/), { target: { value: "220" } });
    expect(screen.getByLabelText(/Bed X/)).toBeTruthy();
    expect((screen.getByLabelText("Print bed") as HTMLSelectElement).value).toBe("custom");
  });

  it("keeps the fields when a printer that starts on a custom bed is typed into a preset size", () => {
    function Harness() {
      const [printer, setPrinter] = useState({
        ...DEFAULT_PRINTER,
        bedX: 250,
        bedY: 210,
        bedZ: 200,
      });
      return (
        <PrinterForm
          printer={printer}
          advanced={false}
          onChange={(patch) => setPrinter((p) => ({ ...p, ...patch }))}
        />
      );
    }
    render(<Harness />);
    fireEvent.input(screen.getByLabelText(/Bed Z/), { target: { value: "220" } });
    expect(screen.getByLabelText(/Bed Z/)).toBeTruthy();
    expect((screen.getByLabelText("Print bed") as HTMLSelectElement).value).toBe("custom");
  });
});
