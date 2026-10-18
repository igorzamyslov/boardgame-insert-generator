// src/kit/DisclosureRow.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { DisclosureRow } from "./DisclosureRow";

afterEach(cleanup);

describe("DisclosureRow", () => {
  it("shows the changed dot after the title, named for a reader, only when asked", () => {
    const { rerender } = render(<DisclosureRow plain title="Per player" />);
    expect(screen.queryByRole("img", { name: "Changed" })).toBeNull();
    rerender(<DisclosureRow plain dot title="Per player" />);
    const dot = screen.getByRole("img", { name: "Changed" });
    expect(dot.className).toBe("k-drow__dot");
    expect(dot.parentElement?.className).toBe("k-drow__title");
  });

  it("says how many values changed in the meta, as before", () => {
    render(<DisclosureRow title="Cards" changed={2} />);
    expect(screen.getByRole("button", { name: /^Cards/ }).textContent).toContain("2 changed");
  });
});
