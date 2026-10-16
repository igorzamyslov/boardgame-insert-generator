// src/kit/ListRow.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListRow } from "./ListRow";

afterEach(cleanup);

describe("ListRow", () => {
  it("keeps a long name on one line", () => {
    const long = "Market deck of the northern guild".padEnd(40, "!");
    expect(long).toHaveLength(40);
    render(<ListRow kind="cards" name={long} meta="80 cards" />);
    const el = screen.getByText(long);
    expect(el.classList.contains("ellipsis")).toBe(true);
    expect(el.getAttribute("title")).toBe(long);
  });

  it("is a button that says whether it is selected", () => {
    const onClick = vi.fn();
    render(<ListRow kind="tiles" name="Hex tiles" meta="24 tiles" selected onClick={onClick} />);
    const row = screen.getByRole("button", { name: /Hex tiles/ });
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(row.textContent).toContain("24 tiles");
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is not selected by default, and keeps what sits beside it outside the button", () => {
    render(
      <ListRow
        kind="minis"
        name="Heroes"
        meta="6 figures"
        after={<button type="button">Chip</button>}
      />,
    );
    const row = screen.getByRole("button", { name: /Heroes/ });
    expect(row.getAttribute("aria-pressed")).toBe("false");
    expect(row.contains(screen.getByRole("button", { name: "Chip" }))).toBe(false);
  });

  it("separates the name from the meta for a screen reader", () => {
    render(<ListRow kind="cards" name="Market deck" meta="80 cards" />);
    expect(screen.getByRole("button", { name: /^Market deck,\s*80 cards$/ })).toBeTruthy();
  });

  it("keeps the whole meta in its title when it is cut", () => {
    render(<ListRow kind="cards" name="Market deck" meta="80 cards, sleeved · Layer 1 (bottom)" />);
    expect(screen.getByText(/^80 cards, sleeved/).getAttribute("title")).toBe(
      "80 cards, sleeved · Layer 1 (bottom)",
    );
  });

  describe("compact (the phone sheet's row)", () => {
    it("is a swatch, the name and the meta on the right, and says nothing of being selected", () => {
      const { container } = render(
        <ListRow compact kind="tiles" name="Hex tiles" meta="24 tiles" selected />,
      );
      const row = screen.getByRole("button", { name: /^Hex tiles,\s*24 tiles$/ });
      expect(row.classList.contains("k-row--compact")).toBe(true);
      expect(row.hasAttribute("aria-pressed")).toBe(false);
      expect(container.querySelector(".k-tile")).toBeNull();
      expect(container.querySelector(".k-row__swatch")).toBeTruthy();
      expect(container.querySelector(".k-row__text")).toBeNull();
    });

    it("draws the box's row, which has no kind, as an outlined square", () => {
      const { container } = render(<ListRow compact name="The box" meta="285 × 285 × 70 mm" />);
      expect(container.querySelector(".k-row__swatch--box")).toBeTruthy();
    });

    it("keeps a long name on one line", () => {
      const long = "Market deck of the northern guild".padEnd(40, "!");
      render(<ListRow compact kind="cards" name={long} meta="80 cards" />);
      expect(screen.getByText(long).classList.contains("ellipsis")).toBe(true);
    });
  });
});
