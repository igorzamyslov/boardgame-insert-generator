// src/kit/Disclosure.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Disclosure } from "./Disclosure";
import { DisclosureRow } from "./DisclosureRow";

afterEach(cleanup);

describe("Disclosure", () => {
  it("renders the panel only when open", () => {
    render(
      <Disclosure title="More options" summary="Finger cuts on, stands upright">
        <p>Room for expansions</p>
      </Disclosure>,
    );
    const button = screen.getByRole("button", { name: /More options/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Room for expansions")).toBeNull();
    expect(document.getElementById(button.getAttribute("aria-controls") ?? "")).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel?.textContent).toBe("Room for expansions");
  });

  it("shows its summary and can be driven from outside", () => {
    const onOpenChange = vi.fn();
    render(
      <Disclosure title="More options" summary="Finger cuts on" open onOpenChange={onOpenChange}>
        <p>Inside</p>
      </Disclosure>,
    );
    expect(screen.getByText("Finger cuts on")).toBeTruthy();
    expect(screen.getByText("Inside")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("DisclosureRow", () => {
  it("says how many values are changed, in the changed ink", () => {
    const { container } = render(<DisclosureRow title="Room around things" changed={2} />);
    expect(screen.getByRole("button", { name: /Room around things/ })).toBeTruthy();
    expect(container.textContent).toContain("2 changed");
    expect(container.querySelector(".k-drow__meta")?.hasAttribute("data-changed")).toBe(true);
  });

  it("says its meta when nothing is changed, and whether it is open", () => {
    render(<DisclosureRow title="Cards" meta="4 values" open={false} />);
    const row = screen.getByRole("button", { name: /Cards/ });
    expect(row.textContent).toContain("4 values");
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });
});
