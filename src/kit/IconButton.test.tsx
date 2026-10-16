// src/kit/IconButton.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloseButton, IconButton } from "./IconButton";
import { Icon } from "./icons";

afterEach(cleanup);

describe("IconButton", () => {
  it("is named by its label", () => {
    const { container } = render(<IconButton label="Undo" icon={<Icon name="undo" />} />);
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(container.querySelector(".k-iconbtn__dot")).toBeNull();
  });

  it("draws a dot that assistive technology skips", () => {
    const { container } = render(
      <IconButton label="Project menu" variant="outlined" dot icon={<Icon name="more" />} />,
    );
    const dot = container.querySelector(".k-iconbtn__dot");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Project menu" })).toBeTruthy();
  });

  it("explains a blocked action and does not run it", () => {
    const onClick = vi.fn();
    render(
      <IconButton
        label="Fewer"
        icon={<Icon name="minus" />}
        blockedReason="Already the fewest"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: "Fewer" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Already the fewest");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("closes: a soft button called Close", () => {
    const onClick = vi.fn();
    render(<CloseButton onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button.classList.contains("k-iconbtn--soft")).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
