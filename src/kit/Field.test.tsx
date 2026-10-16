// src/kit/Field.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Field } from "./Field";

afterEach(cleanup);

describe("Field", () => {
  it("labels its input, and the unit is not part of the name", () => {
    render(<Field id="w" label="Width" value="285" unit="mm" onInput={() => undefined} />);
    const input = screen.getByRole("textbox", { name: /^Width/ });
    expect((input as HTMLInputElement).value).toBe("285");
    expect(screen.getByText("mm").getAttribute("aria-hidden")).toBe("true");
  });

  it("gives a millimetre field the decimal keyboard and Return moves on", () => {
    render(<Field id="w" label="Width" value="285" onInput={() => undefined} />);
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("enterkeyhint")).toBe("next");
  });

  it("gives a count the numeric keyboard", () => {
    render(<Field id="n" label="Cards" value="80" mode="integer" onInput={() => undefined} />);
    expect(screen.getByRole("textbox").getAttribute("inputmode")).toBe("numeric");
  });

  it("flags an error on the input and points at its message", () => {
    render(
      <Field
        id="h"
        label="Height"
        value="7"
        error="That box is too shallow for any tray."
        onInput={() => undefined}
      />,
    );
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toBe("That box is too shallow for any tray.");
    expect(message?.getAttribute("role")).toBe("alert");
    expect(input.closest(".k-field__box")?.hasAttribute("data-invalid")).toBe(true);
  });

  it("is not invalid when there is no error", () => {
    render(<Field id="h" label="Height" value="70" onInput={() => undefined} />);
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("reports what is typed", () => {
    const onInput = vi.fn();
    render(<Field id="w" label="Width" value="285" onInput={onInput} />);
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "290" } });
    expect(onInput).toHaveBeenCalledWith("290");
  });

  it("keeps the focus glow on the box, as base.css draws it", () => {
    const { container } = render(
      <Field id="w" label="Width" value="1" onInput={() => undefined} />,
    );
    expect(container.querySelector(".k-field__box")?.classList.contains("field-box")).toBe(true);
  });
});
