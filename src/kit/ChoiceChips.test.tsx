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

describe("ChoiceChips describedBy", () => {
  it("points the group at a message drawn under it", () => {
    render(
      <ChoiceChips
        label="Tray shape"
        options={[{ value: "a", label: "A" }]}
        value={[]}
        describedBy="why"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("group", { name: "Tray shape" }).getAttribute("aria-describedby")).toBe(
      "why",
    );
  });

  it("marks a chip whose value differs from its default: a dot, and ', changed' for a reader", () => {
    render(
      <ChoiceChips
        label="Tray shape"
        options={[
          { value: "cuts", label: "Finger cuts", changed: true },
          { value: "holes", label: "Corner holes" },
        ]}
        value={["cuts"]}
        onChange={() => undefined}
      />,
    );
    const cuts = screen.getByRole("button", { name: "Finger cuts, changed" });
    expect(cuts.querySelector(".k-chip__dot")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Corner holes" }).querySelector(".k-chip__dot")).toBe(
      null,
    );
  });

  it("keeps a blocked chip focusable, says why, and does nothing when it is pressed", () => {
    const onChange = vi.fn();
    render(
      <ChoiceChips
        label="Tray shape"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B", blockedReason: "B needs room." },
        ]}
        value={[]}
        onChange={onChange}
      />,
    );
    const chip = screen.getByRole("button", { name: "B" });
    expect(chip.getAttribute("aria-disabled")).toBe("true");
    expect(chip.hasAttribute("disabled")).toBe(false);
    expect(chip.getAttribute("title")).toBe("B needs room.");
    expect(document.getElementById(chip.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "B needs room.",
    );
    fireEvent.click(chip);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(onChange).toHaveBeenCalledWith("a");
  });
});
