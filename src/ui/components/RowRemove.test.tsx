// src/ui/components/RowRemove.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RowRemove } from "./RowRemove";

afterEach(cleanup);

describe("RowRemove", () => {
  it("removes the row", () => {
    const onRemove = vi.fn();
    render(<RowRemove label="Remove deck A" onlyOne={false} reason="why" onRemove={onRemove} />);
    const b = screen.getByRole("button", { name: "Remove deck A" });
    expect(b.hasAttribute("aria-disabled")).toBe(false);
    expect(b.hasAttribute("aria-describedby")).toBe(false);
    fireEvent.click(b);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("on the last row stays focusable, says why, and does nothing", () => {
    const onRemove = vi.fn();
    render(
      <RowRemove
        label="Remove deck A"
        onlyOne
        reason="There has to be at least one deck."
        onRemove={onRemove}
      />,
    );
    const b = screen.getByRole("button", { name: "Remove deck A" });
    expect(b.hasAttribute("disabled")).toBe(false);
    expect(b.getAttribute("aria-disabled")).toBe("true");
    b.focus();
    expect(document.activeElement).toBe(b);
    expect(document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "There has to be at least one deck.",
    );
    fireEvent.click(b);
    expect(onRemove).not.toHaveBeenCalled();
  });
});
