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
});
