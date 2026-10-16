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
    expect(checkNumber("−", {})).toEqual({ kind: "incomplete" });
    expect(checkNumber("-6,", {})).toEqual({ kind: "incomplete" });
  });

  it("rejects text with a second separator or a stray sign", () => {
    for (const junk of ["6,,", "1.2.", "63,5.", "6,5,", "--", "1,2,3"]) {
      expect(checkNumber(junk, {}).kind, junk).toBe("error");
    }
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
  it("uses a decimal keyboard for mm", () => {
    render(<NumberField id="w" label="Inner width" unit="mm" value={290} onCommit={vi.fn()} />);
    expect(input().getAttribute("inputmode")).toBe("decimal");
  });

  it("uses a numeric keyboard for counts", () => {
    render(<NumberField id="w" label="Inner width" value={3} integer onCommit={vi.fn()} />);
    expect(input().getAttribute("inputmode")).toBe("numeric");
  });

  it("makes the keyboard's Return key say Next", () => {
    render(<NumberField id="w" label="Inner width" value={3} onCommit={vi.fn()} />);
    expect(input().getAttribute("enterkeyhint")).toBe("next");
  });

  it("commits 6, 63 and 63.5 while typing, but not the incomplete 63,", () => {
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

  it("flags junk separators as errors while typing and on blur", () => {
    for (const junk of ["6,,", "1.2.", "63,5."]) {
      const onCommit = vi.fn();
      const view = render(
        <NumberField id="w" label="Inner width" value={290} onCommit={onCommit} />,
      );
      const el = input();
      type(el, junk);
      expect(el.getAttribute("aria-invalid"), junk).toBe("true");
      fireEvent.blur(el);
      expect(screen.getByRole("alert").textContent, junk).toMatch(/Not a number/);
      expect(onCommit, junk).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it("turns a lone sign or separator into an error on blur", () => {
    for (const lone of ["-", ".", ","]) {
      const onCommit = vi.fn();
      const view = render(
        <NumberField id="w" label="Inner width" value={290} onCommit={onCommit} />,
      );
      const el = input();
      type(el, lone);
      expect(screen.queryByRole("alert"), lone).toBeNull();
      fireEvent.blur(el);
      expect(screen.getByRole("alert").textContent, lone).toBe("Enter a number.");
      expect(el.getAttribute("aria-invalid"), lone).toBe("true");
      expect(onCommit, lone).not.toHaveBeenCalled();
      view.unmount();
    }
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

  it("tidies a pending separator on blur even when the value is unchanged", () => {
    const onCommit = vi.fn();
    render(<NumberField id="w" label="Inner width" value={63} onCommit={onCommit} />);
    const el = input();
    type(el, "63,");
    expect(el.value).toBe("63,");
    fireEvent.blur(el);
    expect(el.value).toBe("63");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps the comma style when tidying on blur", () => {
    render(<NumberField id="w" label="Inner width" value={63.5} onCommit={vi.fn()} />);
    const el = input();
    type(el, " 63,50 ");
    fireEvent.blur(el);
    expect(el.value).toBe("63,5");
  });

  it("with commitOn blur, commits on Enter as well", () => {
    const onCommit = vi.fn();
    render(
      <NumberField id="w" label="Inner width" value={63.5} onCommit={onCommit} commitOn="blur" />,
    );
    const el = input();
    type(el, "88");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(el, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(88);
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

  it("flags only error notices as invalid; warnings and info are plain notes", () => {
    render(
      <ValidationContext.Provider
        value={[
          { level: "warning", code: "w", path: "/box/innerWidth", message: "Quite large." },
          { level: "info", code: "i", path: "/box/innerWidth", message: "For your info." },
        ]}
      >
        <NumberField
          id="w"
          label="Inner width"
          value={400}
          onCommit={vi.fn()}
          path="/box/innerWidth"
        />
      </ValidationContext.Provider>,
    );
    const el = input();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(el.getAttribute("aria-invalid")).toBe("false");
    const note = screen.getByText(/Quite large\./);
    expect(note.textContent).toBe("Quite large. For your info.");
    expect(el.getAttribute("aria-describedby")).toContain(note.id);
  });

  it("shows an error and a warning at the same path separately", () => {
    render(
      <ValidationContext.Provider
        value={[
          { level: "error", code: "e", path: "/box/innerWidth", message: "Too small." },
          { level: "warning", code: "w", path: "/box/innerWidth", message: "Also odd." },
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
    expect(screen.getByRole("alert").textContent).toBe("Too small.");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Also odd.")).toBeTruthy();
  });
});
