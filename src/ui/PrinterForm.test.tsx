// src/ui/PrinterForm.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRINTER } from "../model/defaults";
import { PrinterForm, bedPresetOf } from "./PrinterForm";

afterEach(cleanup);

describe("PrinterForm", () => {
  it("recognizes presets and applies a picked preset", () => {
    expect(bedPresetOf(DEFAULT_PRINTER)).toBe("bambu-256");
    expect(bedPresetOf({ ...DEFAULT_PRINTER, bedX: 300 })).toBe("custom");
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} onChange={onChange} />);
    expect(screen.queryByLabelText(/Bed X/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Print bed"), { target: { value: "prusa-mk4" } });
    expect(onChange).toHaveBeenCalledWith({ bedX: 250, bedY: 210, bedZ: 220 });
  });

  it("shows X/Y/Z for a custom bed", () => {
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Print bed"), { target: { value: "custom" } });
    fireEvent.input(screen.getByLabelText(/Bed X/), { target: { value: "300" } });
    expect(onChange).toHaveBeenCalledWith({ bedX: 300 });
    expect(screen.getByLabelText(/Bed Y/)).toBeTruthy();
    expect(screen.getByLabelText(/Bed Z/)).toBeTruthy();
  });

  it("shows bed margin and layer height", () => {
    render(<PrinterForm printer={DEFAULT_PRINTER} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Bed margin/)).toBeTruthy();
    expect(screen.getByLabelText(/Layer height/)).toBeTruthy();
  });
});

describe("PrinterForm custom bed", () => {
  it("drops a custom choice when another project's preset bed is loaded", () => {
    const view = render(<PrinterForm printer={DEFAULT_PRINTER} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Print bed"), { target: { value: "custom" } });
    expect(screen.getByLabelText(/Bed X/)).toBeTruthy();
    view.rerender(
      <PrinterForm
        printer={{ ...DEFAULT_PRINTER, bedX: 250, bedY: 210, bedZ: 220 }}

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
