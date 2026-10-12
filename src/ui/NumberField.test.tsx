// src/ui/NumberField.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberField, checkNumber } from "./NumberField";
import { ValidationContext } from "./validation";

afterEach(cleanup);

function input(): HTMLInputElement {
  const el = screen.getByLabelText(/Inner width/);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error("not an input");
  }
  return el;
}

function type(el: HTMLInputElement, text: string): void {
  fireEvent.input(el, { target: { value: text } });
}

describe("checkNumber", () => {
  it("treats a trailing separator or a lone sign as incomplete", () => {
    expect(checkNumber("63,", {})).toEqual({ kind: "incomplete" });
    expect(checkNumber("63.", {})).toEqual({ kind: "incomplete" });
    expect(checkNumber("-", {})).toEqual({ kind: "incomplete" });
  });

  it("parses comma and point, and applies rules", () => {
    expect(checkNumber("63,5", {})).toEqual({ kind: "ok", value: 63.5 });
    expect(checkNumber(" 63.5 ", { min: 0, minExclusive: true })).toEqual({
      kind: "ok",
      value: 63.5,
    });
    expect(checkNumber("0", { min: 0, minExclusive: true }).kind).toBe("error");
    expect(checkNumber("2,5", { integer: true }).kind).toBe("error");
    expect(checkNumber("1001", { max: 1000 }).kind).toBe("error");
    expect(checkNumber("", {}).kind).toBe("error");
    expect(checkNumber("6x", {}).kind).toBe("error");
  });
});

describe("NumberField", () => {
  it("63, is incomplete and commits 63.5 once", () => {
    const onCommit = vi.fn();
    render(<NumberField id="w" label="Inner width" unit="mm" value={290} onCommit={onCommit} />);
    const el = input();
    type(el, "6");
    type(el, "63");
    type(el, "63,");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(el.getAttribute("aria-invalid")).toBe("false");
    type(el, "63,5");
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([6, 63, 63.5]);
  });

  it("shows an inline error and does not commit invalid text", () => {
    const onCommit = vi.fn();
    render(
      <NumberField
        id="w"
        label="Inner width"
        value={290}
        onCommit={onCommit}
        min={0}
        minExclusive
      />,
    );
    const el = input();
    type(el, "6x");
    expect(onCommit).not.toHaveBeenCalled();
    expect(el.getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Not a number/);
    expect(el.getAttribute("aria-describedby")).toContain(alert.id);
    type(el, "0");
    expect(screen.getByRole("alert").textContent).toMatch(/more than 0/);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits a pending trailing separator on blur", () => {
    const onCommit = vi.fn();
    render(<NumberField id="w" label="Inner width" value={290} onCommit={onCommit} />);
    const el = input();
    type(el, "63,");
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledWith(63);
  });

  it("with commitOn blur, commits once when leaving the field", () => {
    const onCommit = vi.fn();
    render(
      <NumberField id="w" label="Inner width" value={63.5} onCommit={onCommit} commitOn="blur" />,
    );
    const el = input();
    type(el, "8");
    type(el, "88");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(88);
  });

  it("follows external value changes but keeps the user's comma spelling", () => {
    const onCommit = vi.fn();
    const view = render(<NumberField id="w" label="Inner width" value={290} onCommit={onCommit} />);
    const el = input();
    type(el, "63,5");
    view.rerender(<NumberField id="w" label="Inner width" value={63.5} onCommit={onCommit} />);
    expect(el.value).toBe("63,5");
    view.rerender(<NumberField id="w" label="Inner width" value={120} onCommit={onCommit} />);
    expect(el.value).toBe("120");
  });

  it("shows project validation notices for its path", () => {
    render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.length",
            path: "/box/innerWidth",
            message: "Box width must be greater than 0 mm.",
          },
          { level: "error", code: "field.length", path: "/box/innerDepth", message: "Other field" },
        ]}
      >
        <NumberField
          id="w"
          label="Inner width"
          value={0}
          onCommit={vi.fn()}
          path="/box/innerWidth"
        />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Box width must be greater than 0 mm.");
    expect(screen.queryByText("Other field")).toBeNull();
  });
});
