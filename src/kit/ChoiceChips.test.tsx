// src/kit/ChoiceChips.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoiceChips } from "./ChoiceChips";

afterEach(cleanup);

const SIZES = [
  { value: "standard", label: "Standard" },
  { value: "mini", label: "Mini" },
  { value: "tarot", label: "Tarot" },
];

describe("ChoiceChips", () => {
  it("marks the chosen chip", () => {
    render(
      <ChoiceChips label="Card size" options={SIZES} value="standard" onChange={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "Standard" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Mini" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Tarot" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("group", { name: "Card size" })).toBeTruthy();
  });

  it("reports the chip pressed", () => {
    const onChange = vi.fn();
    render(<ChoiceChips label="Card size" options={SIZES} value="standard" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Tarot" }));
    expect(onChange).toHaveBeenCalledWith("tarot");
  });

  it("marks every chosen chip when several can be on", () => {
    render(
      <ChoiceChips
        label="Tray shape"
        options={SIZES}
        value={["mini", "tarot"]}
        onChange={() => undefined}
      />,
    );
    const on = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.textContent);
    expect(on).toEqual(["Mini", "Tarot"]);
  });
});
