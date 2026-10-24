// src/kit/Notice.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Notice } from "./Notice";

afterEach(cleanup);

describe("Notice", () => {
  it("says its title in bold, then its words, and offers two choices", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    const { container } = render(
      <Notice
        tone="info"
        title="The inputs changed."
        primary={{ label: "Make a new plan", onClick: onPrimary }}
        secondary={{ label: "Use the old plan", onClick: onSecondary }}
      >
        This plan is for the old numbers.
      </Notice>,
    );
    expect(container.querySelector("strong")?.textContent).toBe("The inputs changed.");
    expect(container.textContent).toContain("This plan is for the old numbers.");
    fireEvent.click(screen.getByRole("button", { name: "Make a new plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Use the old plan" }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("names its tone and does not speak by itself", () => {
    const { container } = render(
      <Notice tone="warn" title="Older tray shape.">
        Make a new plan to use the new shape.
      </Notice>,
    );
    const root = container.querySelector(".k-notice");
    expect(root?.getAttribute("data-tone")).toBe("warn");
    expect(root?.hasAttribute("role")).toBe(false);
  });

  it("has a × named Hide this note only when it can be closed", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Notice tone="info" title="Note:">
        Spacers were cut.
      </Notice>,
    );
    expect(screen.queryByRole("button", { name: "Hide this note" })).toBeNull();
    rerender(
      <Notice tone="info" title="Note:" onClose={onClose}>
        Spacers were cut.
      </Notice>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide this note" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
