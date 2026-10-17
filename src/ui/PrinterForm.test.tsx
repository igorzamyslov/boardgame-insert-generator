// src/ui/PrinterForm.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PRINTER } from "../model/defaults";
import { PrinterForm, bedPresetOf } from "./PrinterForm";

afterEach(cleanup);

const chip = (name: string): HTMLElement =>
  within(screen.getByRole("group", { name: "Printer bed" })).getByRole("button", { name });
const openDetails = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /^Printer details/ }));
};

describe("PrinterForm", () => {
  it("recognizes presets", () => {
    expect(bedPresetOf(DEFAULT_PRINTER)).toBe("bambu-256");
    expect(bedPresetOf({ ...DEFAULT_PRINTER, bedX: 300 })).toBe("custom");
  });

  it("offers the bed as Small, Medium, Large and My own size, and says what it limits", () => {
    render(<PrinterForm printer={DEFAULT_PRINTER} onChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Printer bed" })).toBeTruthy();
    const group = screen.getByRole("group", { name: "Printer bed" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Small, 180 mm", "Medium, 220 mm", "Large, 256 mm", "My own size"]);
    expect(chip("Large, 256 mm").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("No tray will be bigger than this.")).toBeTruthy();
  });

  it("applies a picked bed", () => {
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} onChange={onChange} />);
    fireEvent.click(chip("Medium, 220 mm"));
    expect(onChange).toHaveBeenLastCalledWith({ bedX: 220, bedY: 220, bedZ: 250 });
    fireEvent.click(chip("Small, 180 mm"));
    expect(onChange).toHaveBeenLastCalledWith({ bedX: 180, bedY: 180, bedZ: 180 });
  });

  it("keeps the printer's other numbers under Printer details, said in one line", () => {
    render(<PrinterForm printer={DEFAULT_PRINTER} onChange={vi.fn()} />);
    const row = screen.getByRole("button", { name: /^Printer details/ });
    expect(row.textContent).toBe("Printer details5 mm margin, 0.2 mm layers");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText(/Bed margin/)).toBeNull();
    expect(screen.queryByLabelText(/Layer height/)).toBeNull();
    expect(screen.queryByLabelText(/Bed X/)).toBeNull();
    openDetails();
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText(/Bed margin/)).toBeTruthy();
    expect(screen.getByLabelText(/Layer height/)).toBeTruthy();
    // a preset bed has no own size to type
    expect(screen.queryByLabelText(/Bed X/)).toBeNull();
  });

  it("commits the margin and the layer height", () => {
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} onChange={onChange} />);
    openDetails();
    fireEvent.input(screen.getByLabelText(/Bed margin/), { target: { value: "8" } });
    expect(onChange).toHaveBeenLastCalledWith({ bedMargin: 8 });
    fireEvent.input(screen.getByLabelText(/Layer height/), { target: { value: "0,3" } });
    expect(onChange).toHaveBeenLastCalledWith({ layerHeight: 0.3 });
  });

  it("puts what the sheet adds (folding risers) inside Printer details", () => {
    render(
      <PrinterForm printer={DEFAULT_PRINTER} onChange={vi.fn()}>
        <p>Extra inside</p>
      </PrinterForm>,
    );
    expect(screen.queryByText("Extra inside")).toBeNull();
    openDetails();
    expect(screen.getByText("Extra inside")).toBeTruthy();
  });

  it("My own size opens Printer details with X, Y and Z", () => {
    const onChange = vi.fn();
    render(<PrinterForm printer={DEFAULT_PRINTER} onChange={onChange} />);
    fireEvent.click(chip("My own size"));
    expect(chip("My own size").getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("button", { name: /^Printer details/ }).getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.input(screen.getByLabelText(/Bed X/), { target: { value: "300" } });
    expect(onChange).toHaveBeenCalledWith({ bedX: 300 });
    expect(screen.getByLabelText(/Bed Y/)).toBeTruthy();
    expect(screen.getByLabelText(/Bed Z/)).toBeTruthy();
  });

  it("calls a bed that is no preset My own size, with its fields", () => {
    render(
      <PrinterForm
        printer={{ ...DEFAULT_PRINTER, bedX: 250, bedY: 210, bedZ: 220 }}
        onChange={vi.fn()}
      />,
    );
    expect(chip("My own size").getAttribute("aria-pressed")).toBe("true");
    for (const name of ["Small, 180 mm", "Medium, 220 mm", "Large, 256 mm"]) {
      expect(chip(name).getAttribute("aria-pressed")).toBe("false");
    }
    openDetails();
    expect((screen.getByLabelText(/Bed X/) as HTMLInputElement).value).toBe("250");
  });
});

describe("PrinterForm custom bed", () => {
  it("drops a custom choice when another project's preset bed is loaded", () => {
    const view = render(<PrinterForm printer={DEFAULT_PRINTER} onChange={vi.fn()} />);
    fireEvent.click(chip("My own size"));
    expect(screen.getByLabelText(/Bed X/)).toBeTruthy();
    view.rerender(
      <PrinterForm
        printer={{ ...DEFAULT_PRINTER, bedX: 220, bedY: 220, bedZ: 250 }}
        onChange={vi.fn()}
      />,
    );
    expect(chip("Medium, 220 mm").getAttribute("aria-pressed")).toBe("true");
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
    fireEvent.click(chip("My own size"));
    fireEvent.input(screen.getByLabelText(/Bed X/), { target: { value: "220" } });
    fireEvent.input(screen.getByLabelText(/Bed Y/), { target: { value: "220" } });
    fireEvent.input(screen.getByLabelText(/Bed Z/), { target: { value: "250" } });
    expect(screen.getByLabelText(/Bed X/)).toBeTruthy();
    expect(chip("My own size").getAttribute("aria-pressed")).toBe("true");
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
    openDetails();
    fireEvent.input(screen.getByLabelText(/Bed X/), { target: { value: "256" } });
    fireEvent.input(screen.getByLabelText(/Bed Y/), { target: { value: "256" } });
    fireEvent.input(screen.getByLabelText(/Bed Z/), { target: { value: "256" } });
    expect(screen.getByLabelText(/Bed Z/)).toBeTruthy();
    expect(chip("My own size").getAttribute("aria-pressed")).toBe("true");
  });
});
