// src/kit/CheckRow.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckRow } from "./CheckRow";

afterEach(cleanup);

describe("CheckRow", () => {
  it("is a checkbox named by its label, with the hint as its description", () => {
    render(
      <CheckRow
        label="Room for fingers"
        hint="Extra space beside walls to grab things"
        checked
        onChange={() => undefined}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Room for fingers" });
    expect((box as HTMLInputElement).checked).toBe(true);
    const hint = document.getElementById(box.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Extra space beside walls to grab things");
  });

  it("reports the new state", () => {
    const onChange = vi.fn();
    render(<CheckRow label="Fill to the lid" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Fill to the lid" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("has a compact row for the printer's list", () => {
    const { container } = render(
      <CheckRow label="Engrave tray names" checked compact onChange={() => undefined} />,
    );
    expect(container.querySelector(".k-check")?.hasAttribute("data-compact")).toBe(true);
  });
});

describe("CheckRow blocked", () => {
  it("stays focusable, says why through its hint, and does nothing when pressed", () => {
    const onChange = vi.fn();
    render(
      <CheckRow
        label="Round the corners"
        hint="Not available for flat decks."
        checked={false}
        blocked
        onChange={onChange}
      />,
    );
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.disabled).toBe(false);
    expect(box.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(box.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Not available for flat decks.",
    );
    fireEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
    expect(box.checked).toBe(false);
  });

  it("points at a message drawn under the row as well as at its hint", () => {
    render(
      <CheckRow
        label="L"
        hint="Hint"
        checked
        describedBy="why"
        invalid
        onChange={() => undefined}
      />,
    );
    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("aria-describedby")?.split(" ")).toContain("why");
    expect(box.getAttribute("aria-invalid")).toBe("true");
  });

  it("puts the box before its words with boxFirst", () => {
    const { container, rerender } = render(<CheckRow label="Fill" checked onChange={vi.fn()} />);
    expect(container.querySelector(".k-check")?.hasAttribute("data-lead")).toBe(false);
    rerender(<CheckRow label="Fill" checked boxFirst onChange={vi.fn()} />);
    expect(container.querySelector(".k-check")?.hasAttribute("data-lead")).toBe(true);
  });
});
