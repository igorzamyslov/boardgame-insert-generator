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

  describe("two notes under the plan", () => {
    const close = (text: string): void => {
      const li = within(notes()).getByText(text).closest("li") as HTMLElement;
      fireEvent.click(within(li).getByRole("button", { name: "Hide this note" }));
    };
    const gone = (text: string): boolean => within(document.body).queryByText(text) === null;
    // Two notes of the same kind with no field of their own (two stacks that only fit in one
    // order): the same code and path, different words.
    const joint = (message: string): Notice => ({
      level: "info",
      code: "layout.copiesJoint",
      message,
    });
    const pairs: [string, () => Notice[]][] = [
      [
        "of different kinds",
        () => [
          warning("Starter has no finger cut.", "/components/0"),
          { level: "info", code: "layout.capped", message: "Capped at 4." },
        ],
      ],
      [
        "of one kind with no field",
        () => [joint("The top Gold tray has no rim."), joint("The top Ships tray has no rim.")],
      ],
    ];
    for (const [what, make] of pairs) {
      const [first, second] = make().map((n) => n.message) as [string, string];
      it(`keeps both hidden, ${what}, closing the first then the second`, () => {
        const { store } = renderApp({ project: project() });
        say(store, make());
        close(first);
        close(second);
        expect(gone(first)).toBe(true);
        expect(gone(second)).toBe(true);
        expect(screen.getByRole("button", { name: "Show 2 hidden" })).toBeTruthy();
      });
      it(`keeps both hidden, ${what}, closing the second then the first`, () => {
        const { store } = renderApp({ project: project() });
        say(store, make());
        close(second);
        close(first);
        expect(gone(first)).toBe(true);
        expect(gone(second)).toBe(true);
        expect(screen.getByRole("button", { name: "Show 2 hidden" })).toBeTruthy();
      });
      it(`keeps both hidden, ${what}, after a reload`, () => {
        const storage = new MemoryStorage();
        const p = project();
        const a = renderApp({ project: p, storage });
        say(a.store, make());
        close(first);
        close(second);
        cleanup();
        const b = renderApp({ project: p, storage });
        say(b.store, make());
        expect(gone(first)).toBe(true);
        expect(gone(second)).toBe(true);
        expect(screen.getByRole("button", { name: "Show 2 hidden" })).toBeTruthy();
      });
      it(`${what}: the one whose words change comes back, the other stays hidden`, () => {
        const { store } = renderApp({ project: project() });
        const [n1, n2] = make() as [Notice, Notice];
        say(store, [n1, n2]);
        close(first);
        close(second);
        say(store, [{ ...n1, message: `${first} Changed.` }, n2]);
        expect(within(notes()).getByText(`${first} Changed.`)).toBeTruthy();
        expect(gone(second)).toBe(true);
        expect(screen.getByRole("button", { name: "Show 1 hidden" })).toBeTruthy();
      });
    }
  });

  it("gives an error no ×", () => {
    const { store } = renderApp({ project: project() });
    say(store, [{ level: "error", code: "e.1", message: "Stuck." }]);
    expect(within(notes()).queryByRole("button", { name: "Hide this note" })).toBeNull();
  });
});
