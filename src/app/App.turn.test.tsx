// src/app/App.turn.test.tsx
// @vitest-environment jsdom
// Turned in the rail (0.7.0 Task 13): the chip a turn lock draws, its × and Clear all my choices.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSeed } from "../test-support/harbourKings";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });

function turned() {
  const project = loadSeed("harbour-kings").project;
  const id = project.components[0]?.id;
  if (id === undefined) {
    throw new Error("the seed has no items");
  }
  const key = `${id}:p0:0`;
  const app = renderApp({ project });
  act(() =>
    app.store.edit((q) => ({ ...q, locks: [{ kind: "turn", trayKey: key, rotated: true }] })),
  );
  return { ...app, key };
}

describe("Turned in the rail", () => {
  it("draws a Turned chip for a turn lock, and its × lets that tray turn in one undo step", () => {
    const { store, key } = turned();
    const locks = store.state.project.value.locks;
    expect(locks).toEqual([{ kind: "turn", trayKey: key, rotated: true }]);
    const chip = within(rail()).getByText("Turned");
    expect(chip).toBeTruthy();
    expect(
      within(rail()).getByText("Turned trays keep their direction when the plan updates."),
    ).toBeTruthy();
    // edits within a moment of each other are one step: the person's click comes later than that
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    const x = within(rail()).getByRole("button", { name: /^Let .+ turn$/ });
    fireEvent.click(x);
    expect(store.state.project.value.locks).toEqual([]);
    expect(within(rail()).queryByText("Turned")).toBeNull();
    act(() => store.undo());
    expect(store.state.project.value.locks).toEqual(locks);
    expect(within(rail()).getByText("Turned")).toBeTruthy();
  });

  it("is lifted by Clear all my choices, with every other rule", () => {
    const { store } = turned();
    fireEvent.click(within(rail()).getByRole("button", { name: "Clear all my choices" }));
    expect(store.state.project.value.locks).toEqual([]);
  });
});
