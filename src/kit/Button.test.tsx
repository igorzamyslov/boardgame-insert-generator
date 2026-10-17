// src/kit/Button.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Icon } from "./icons";

afterEach(cleanup);

describe("Button", () => {
  it("explains a blocked action", () => {
    const onClick = vi.fn();
    render(
      <Button blockedReason="Fix the fit to download" onClick={onClick}>
        Download
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Download" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Fix the fit to download");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("tells a press on a blocked button to its owner, and runs nothing else", () => {
    const onClick = vi.fn();
    const onBlockedClick = vi.fn();
    const { rerender } = render(
      <Button onClick={onClick} onBlockedClick={onBlockedClick}>
        Download
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onBlockedClick).not.toHaveBeenCalled();
    rerender(
      <Button blockedReason="Not yet" onClick={onClick} onBlockedClick={onBlockedClick}>
        Download
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onBlockedClick).toHaveBeenCalledTimes(1);
  });

  it("has nothing to describe when the reason is empty (its own words say it)", () => {
    render(<Button blockedReason="">Fix the fit to download</Button>);
    const button = screen.getByRole("button", { name: "Fix the fit to download" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("aria-describedby")).toBe(false);
  });

  it("keeps a blocked button in the Tab order", () => {
    render(<Button blockedReason="Not yet">Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("runs its click handler when it is not blocked", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Done
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Done" });
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-describedby")).toBeNull();
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("names its variant and size, and hides its icon from assistive technology", () => {
    render(
      <Button variant="soft" size="cta" icon={<Icon name="download" />}>
        Download the 3MF file
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Download the 3MF file" });
    expect(button.classList.contains("k-btn--soft")).toBe(true);
    expect(button.classList.contains("k-btn--cta")).toBe(true);
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is a secondary control of the standard size by default", () => {
    render(<Button>Add</Button>);
    const button = screen.getByRole("button", { name: "Add" });
    expect(button.classList.contains("k-btn--secondary")).toBe(true);
    expect(button.classList.contains("k-btn--control")).toBe(true);
  });
});
