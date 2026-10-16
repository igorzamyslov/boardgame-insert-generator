// src/kit/Stepper.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

afterEach(cleanup);

describe("Stepper", () => {
  it("steps the count", () => {
    const onChange = vi.fn();
    render(<Stepper label="Number of cards" value={80} min={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onChange).toHaveBeenCalledWith(81);
    fireEvent.click(screen.getByRole("button", { name: "Fewer" }));
    expect(onChange).toHaveBeenLastCalledWith(79);
  });

  it("blocks Fewer at the lowest count and says why", () => {
    const onChange = vi.fn();
    render(<Stepper label="Number of cards" value={1} min={1} onChange={onChange} />);
    const fewer = screen.getByRole("button", { name: "Fewer" });
    expect(fewer.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(fewer.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent ?? "").not.toBe("");
    fireEvent.click(fewer);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blocks More at the highest count", () => {
    render(
      <Stepper label="Number of cards" value={9} min={1} max={9} onChange={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "More" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Fewer" }).getAttribute("aria-disabled")).toBeNull();
  });

  it("takes a typed count in range, and puts the old one back when it is left bad", () => {
    const onChange = vi.fn();
    render(<Stepper label="Number of cards" value={80} min={1} max={500} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Number of cards" });
    expect(input.getAttribute("inputmode")).toBe("numeric");
    fireEvent.input(input, { target: { value: "120" } });
    expect(onChange).toHaveBeenCalledWith(120);
    onChange.mockClear();
    fireEvent.input(input, { target: { value: "0" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("80");
  });
});
