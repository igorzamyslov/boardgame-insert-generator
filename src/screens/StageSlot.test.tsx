// src/screens/StageSlot.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { StageSlot } from "./StageSlot";

afterEach(cleanup);

describe("StageSlot", () => {
  it("is empty when nothing is selected: the hint is the plan's caption", () => {
    const { container } = render(<StageSlot />);
    expect(screen.queryByText("Tap a tray for details.")).toBeNull();
    expect(container.querySelector(".stage-slot")?.getAttribute("data-held")).toBeNull();
  });

  it("shows what it is given in place of the ask", () => {
    render(
      <StageSlot>
        <p>The tray bar</p>
      </StageSlot>,
    );
    expect(screen.getByText("The tray bar")).toBeTruthy();
    expect(screen.queryByText("Tap a tray for details.")).toBeNull();
  });

  it("says it is held while it has the tray bar, so a note can lie over the box and not push it", () => {
    const { container, rerender } = render(<StageSlot />);
    expect(container.querySelector(".stage-slot")?.hasAttribute("data-held")).toBe(false);
    rerender(
      <StageSlot>
        <p>The tray bar</p>
      </StageSlot>,
    );
    expect(container.querySelector(".stage-slot")?.getAttribute("data-held")).toBe("true");
  });

  it("takes empty children as nothing", () => {
    const { container } = render(<StageSlot>{null}</StageSlot>);
    expect(container.querySelector(".stage-slot")?.getAttribute("data-held")).toBeNull();
  });

  it("keeps its live region, always there, before whatever else it shows", () => {
    const { rerender, container } = render(<StageSlot live={<div role="status" />} />);
    const live = screen.getByRole("status");
    rerender(
      <StageSlot live={<div role="status">Choose the tray.</div>}>
        <p>The tray bar</p>
      </StageSlot>,
    );
    expect(screen.getByRole("status")).toBe(live);
    expect(container.querySelector(".stage-slot")?.firstElementChild).toBe(live);
  });

  it("takes no room while idle, and is still read out", () => {
    const { container } = render(<StageSlot idle />);
    expect(container.querySelector(".stage-slot")?.getAttribute("class")).toContain(
      "visually-hidden",
    );
  });
});
