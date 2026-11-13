// src/app/App.editorPlacement.test.tsx
// @vitest-environment jsdom
// Duplicate and the tray's placement menu in an item's editor (0.27.0): the same actions as the
// tray dock, reached from the editor.
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
  vi.unstubAllGlobals();
});

const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });
const stage = (): HTMLElement => document.querySelector('[data-region="stage"]') as HTMLElement;
const edit = (name: string): void => {
  fireEvent.click(within(rail()).getByRole("button", { name: `Edit ${name}` }));
};

type Seed = ReturnType<typeof loadSeed>["project"];

function seeded(prepare: (p: Seed) => Seed = (p) => p) {
  const project = prepare(loadSeed("harbour-kings").project);
  return { project, ...renderApp({ project }) };
}

describe("Duplicate in an item's editor", () => {
  it("adds '<name> copy' below the item, opens its editor, and is one undo step", () => {
    const { store, project } = seeded();
    const before = project.components.length;
    edit("Market deck");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Market deck" }));
    const after = store.state.project.value;
    expect(after.components).toHaveLength(before + 1);
    const copy = after.components.at(-1);
    expect(copy?.name).toBe("Market deck copy");
    // its editor is open, and the list will show it right below its original
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe(
      "Market deck copy",
    );
    const order = (after.listOrder ?? []).slice();
    const original = project.components.find((c) => c.name === "Market deck");
    expect(order[order.indexOf(original?.id ?? "") + 1]).toBe(copy?.id);
    act(() => store.undo());
    expect(store.state.project.value.components).toHaveLength(before);
  });

  it("is reachable by keyboard: a real button in the tab order", () => {
    seeded();
    edit("Market deck");
    const button = screen.getByRole("button", { name: "Duplicate Market deck" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("tabindex")).not.toBe("-1");
    expect(button.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("the tray's placement menu in an item's editor", () => {
  it("is the dock's menu: Keep here pins the tray, and Undo takes it back", () => {
    const { store } = seeded();
    edit("Market deck");
    fireEvent.click(within(rail()).getByRole("button", { name: "More about this tray" }));
    fireEvent.click(screen.getByRole("button", { name: /^Keep here/ }));
    const pins = store.state.project.value.locks.filter((l) => l.kind === "position");
    expect(pins).toHaveLength(1);
    // the same items as the dock's menu
    for (const name of [
      /^Unpin/,
      /^Rotate 90°/,
      /^Swap places with…/,
      /^Put on…/,
      /^Keep this size/,
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    act(() => store.undo());
    expect(store.state.project.value.locks.filter((l) => l.kind === "position")).toEqual([]);
  });

  it("starts a put-on from the editor: the editor closes and the plan asks for the base", () => {
    const { store } = seeded();
    edit("Market deck");
    fireEvent.click(within(rail()).getByRole("button", { name: "More about this tray" }));
    fireEvent.click(screen.getByRole("button", { name: /^Put on…/ }));
    expect(screen.queryByRole("button", { name: "Duplicate Market deck" })).toBeNull();
    expect(store.state.swapFrom.value).not.toBeNull();
    expect(store.state.pickMode.value).toBe("putOn");
    expect(within(stage()).queryByText(/Pick the tray to put Market deck on\./)).not.toBeNull();
  });

  it("is not offered for an item with several trays: which tray would it be?", () => {
    // two copies of the deck's tray in the plan
    seeded((p) => {
      const deck = p.components.find((c) => c.name === "Market deck");
      const first = p.layout?.trays.find((t) => t.key === `${deck?.id}:p0:0`);
      return p.layout === undefined || first === undefined
        ? p
        : {
            ...p,
            layout: {
              ...p.layout,
              trays: [...p.layout.trays, { ...first, key: `${deck?.id}:p1:0`, x: first.x + 1 }],
            },
          };
    });
    edit("Market deck");
    expect(screen.queryByRole("button", { name: "More about this tray" })).toBeNull();
    // Duplicate stays: it is the item's
    expect(screen.getByRole("button", { name: "Duplicate Market deck" })).toBeTruthy();
  });
});
