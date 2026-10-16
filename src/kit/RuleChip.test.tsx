// src/kit/RuleChip.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import css from "./kit.css?raw";
import { RuleChip } from "./RuleChip";

afterEach(cleanup);

describe("RuleChip", () => {
  it("names what the × does", () => {
    const onClick = vi.fn();
    render(
      <RuleChip aria-label="Unpin Market deck and the trays on it" onClick={onClick}>
        Pinned
      </RuleChip>,
    );
    const chip = screen.getByRole("button", { name: "Unpin Market deck and the trays on it" });
    expect(chip.textContent).toBe("Pinned");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("draws 32 px and keeps a 44 px target", () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(stripped).toMatch(/\.k-rulechip\s*\{[^}]*height:\s*32px/);
    expect(stripped).toMatch(/\.k-rulechip::before\s*\{[^}]*inset:\s*-6px 0/);
  });
});
