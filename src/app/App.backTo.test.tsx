// src/app/App.backTo.test.tsx
// @vitest-environment jsdom
// "Back to <default>" in an item's More options is one change: one step of Undo, which brings the
// value back that was there before Back.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureProject } from "./test-helpers";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Back to <default> in More options", () => {
  it("reverts a chip in one undo step", () => {
    const { store } = renderApp({ project: fixtureProject() });
    const rail = screen.getByRole("complementary", { name: "What's inside" });
    const first = store.state.project.value.components[0];
    expect(first).toBeDefined();
    fireEvent.click(within(rail).getByRole("button", { name: `Edit ${first?.name}` }));
    fireEvent.click(screen.getByRole("button", { name: /^Shape/ }));
    const cuts = (): boolean | undefined => store.state.project.value.components[0]?.fingerCuts;
    // finger cuts are on by default for the first item's kind: turning them off is a change
    const chip = screen.getByRole("button", { name: /^Finger cuts/ });
    const wasOn = chip.getAttribute("aria-pressed") === "true";
    fireEvent.click(chip);
    expect(cuts()).toBe(!wasOn);
    // edits to the same items within a second are one step of Undo (typing a number): leave that behind
    vi.setSystemTime(Date.now() + 5000);
    const back = screen.getByRole("button", {
      name: `Back to finger cuts ${wasOn ? "on" : "off"} for Tray shape`,
    });
    fireEvent.click(back);
    expect(cuts()).toBeUndefined();
    // one Undo is the step before Back: the change is there again, and Back is offered again
    act(() => store.undo());
    expect(cuts()).toBe(!wasOn);
    expect(screen.getByRole("button", { name: /^Back to finger cuts/ })).toBeTruthy();
  });
});
