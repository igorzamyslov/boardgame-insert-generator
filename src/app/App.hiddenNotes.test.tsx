// src/app/App.hiddenNotes.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import { MemoryStorage } from "../test-support/memory-storage";
import type { AppStore } from "./store";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const warning = (message: string, path = "/components/0"): Notice => ({
  level: "warning",
  code: "sizing.noFingerSlot",
  path,
  message,
});

function say(store: AppStore, notices: Notice[]): void {
  act(() => {
    store.state.lastResult.value = {
      layout: store.state.project.value.layout ?? null,
      bestAttempt: null,
      summary: null,
      notices,
      lockConflicts: [],
    };
  });
}

const notes = (): HTMLElement => document.querySelector(".stage-notes") as HTMLElement;
const project = () => loadSeed("harbour-kings-kit").project;

describe("closing a note under the plan", () => {
  it("hides it, offers n hidden, and brings it back", () => {
    const { store } = renderApp({ project: project() });
    say(store, [warning("Starter deck has no finger cut.")]);
    fireEvent.click(within(notes()).getByRole("button", { name: "Hide this note" }));
    expect(document.querySelector(".stage-notes")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 hidden" }));
    expect(within(notes()).getByText("Starter deck has no finger cut.")).toBeTruthy();
  });

  it("is per tray: the same note for another tray still shows", () => {
    const { store } = renderApp({ project: project() });
    say(store, [
      warning("Starter has no finger cut.", "/components/0"),
      warning("Market has no finger cut.", "/components/1"),
    ]);
    fireEvent.click(
      within(notes()).getAllByRole("button", { name: "Hide this note" })[0] as HTMLElement,
    );
    expect(within(notes()).getByText("Market has no finger cut.")).toBeTruthy();
    expect(within(notes()).queryByText("Starter has no finger cut.")).toBeNull();
  });

  it("stays hidden after a reload of the same project, and comes back when its words change", () => {
    const storage = new MemoryStorage();
    const p = project();
    const first = renderApp({ project: p, storage });
    say(first.store, [warning("Cut by 2 mm.")]);
    fireEvent.click(within(notes()).getByRole("button", { name: "Hide this note" }));
    cleanup();
    const second = renderApp({ project: p, storage });
    say(second.store, [warning("Cut by 2 mm.")]);
    expect(document.querySelector(".stage-notes")).toBeNull();
    expect(screen.getByRole("button", { name: "Show 1 hidden" })).toBeTruthy();
    say(second.store, [warning("Cut by 3 mm.")]);
    expect(within(notes()).getByText("Cut by 3 mm.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /hidden/ })).toBeNull();
  });

  it("gives an error no ×", () => {
    const { store } = renderApp({ project: project() });
    say(store, [{ level: "error", code: "e.1", message: "Stuck." }]);
    expect(within(notes()).queryByRole("button", { name: "Hide this note" })).toBeNull();
  });
});
