// src/kit/DisclosureRow.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisclosureRow } from "./DisclosureRow";

afterEach(cleanup);

describe("DisclosureRow", () => {
  it("shows the changed dot after the title, named for a reader, only when asked", () => {
    const { rerender } = render(<DisclosureRow plain title="Copies" />);
    expect(screen.queryByRole("img", { name: "Changed" })).toBeNull();
    rerender(<DisclosureRow plain dot title="Copies" />);
    const dot = screen.getByRole("img", { name: "Changed" });
    expect(dot.className).toBe("k-drow__dot");
    expect(dot.parentElement?.className).toBe("k-drow__title");
  });

  it("says how many values changed in the meta, as before", () => {
    render(<DisclosureRow title="Cards" changed={2} />);
    expect(screen.getByRole("button", { name: /^Cards/ }).textContent).toContain("2 changed");
  });

  it("blocked: stays focusable, shows its reason as the hint, opens nothing", () => {
    const onClick = vi.fn();
    render(
      <DisclosureRow
        plain
        title="Dividers"
        open={false}
        controls="p"
        blockedReason="No."
        onClick={onClick}
      />,
    );
    const row = screen.getByRole("button", { name: /^Dividers/ });
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.hasAttribute("disabled")).toBe(false);
    expect(row.getAttribute("aria-expanded")).toBeNull();
    expect(row.getAttribute("aria-controls")).toBeNull();
    expect(document.getElementById(row.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "No.",
    );
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });
});
