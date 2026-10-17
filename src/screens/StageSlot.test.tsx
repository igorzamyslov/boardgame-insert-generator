// src/screens/StageSlot.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { StageSlot } from "./StageSlot";

afterEach(cleanup);

describe("StageSlot", () => {
  it("asks for a tap when nothing is selected", () => {
    render(<StageSlot />);
    expect(screen.getByText("Tap a tray for details.")).toBeTruthy();
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

  it("takes empty children as nothing, so the ask stays", () => {
    render(<StageSlot>{null}</StageSlot>);
    expect(screen.getByText("Tap a tray for details.")).toBeTruthy();
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

  it("can leave the ask out, when something else is being said", () => {
    render(<StageSlot quiet />);
    expect(screen.queryByText("Tap a tray for details.")).toBeNull();
  });

  it("takes no room while idle, and is still read out", () => {
    const { container } = render(<StageSlot idle />);
    expect(container.querySelector(".stage-slot")?.getAttribute("class")).toContain(
      "visually-hidden",
    );
  });
});
