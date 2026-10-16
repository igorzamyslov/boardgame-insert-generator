// @vitest-environment jsdom
// src/screens/Rail.test.tsx
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureProject } from "../app/test-helpers";
import { renderApp } from "../app/test-app";
import { newComponent, newProject } from "../model/defaults";
import type { Component, Lock } from "../model/types";
import { Rail, SheetList } from "./Rail";

afterEach(cleanup);

const LONG = "The Very Long Name Of A Card Deck Here 40";
const named = (id: string, name: string): Component => ({
  ...newComponent("cards"),
  id,
  name,
});

function handlers() {
  return {
    onOpenBox: vi.fn(),
    onOpenEditor: vi.fn(),
    onAdd: vi.fn(),
    onHover: vi.fn(),
    onClearChoices: vi.fn(),
    onSettings: vi.fn(),
  };
}

function props(over: Partial<Parameters<typeof Rail>[0]> = {}) {
  const p = newProject();
  return {
    components: [named("a", "Market deck"), named("b", LONG)],
    box: { ...p.box, innerWidth: 285, innerDepth: 285, innerHeight: 70 },
    printer: { ...p.printer, bedX: 256, bedY: 256 },
    ...handlers(),
    ...over,
  };
}

const pin: Lock = { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false };

describe("Rail", () => {
  it("opens the box editor from the box card", () => {
    const h = props();
    render(<Rail {...h} />);
    const card = screen.getByRole("button", { name: /The box/ });
    expect(card.textContent).toContain("285 × 285 × 70 mm");
    expect(card.textContent).toContain("Change");
    fireEvent.click(card);
    expect(h.onOpenBox).toHaveBeenCalledTimes(1);
  });

  it("adds from the Add pill", () => {
    const h = props();
    render(<Rail {...h} />);
    expect(screen.queryByRole("button", { name: "Tiles" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const picker = screen.getByRole("group", { name: "Add something inside" });
    expect(
      within(picker)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Cards", "Tokens and dice", "Tiles", "Miniatures", "Something else"]);
    fireEvent.click(screen.getByRole("button", { name: "Tiles" }));
    expect(h.onAdd).toHaveBeenCalledWith("tiles");
    expect(screen.queryByRole("group", { name: "Add something inside" })).toBeNull();
  });

  it("puts the focus on the first kind when the picker opens, and Escape closes it", () => {
    render(<Rail {...props()} />);
    const add = screen.getByRole("button", { name: "Add" });
    expect(add.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(add);
    expect(add.getAttribute("aria-expanded")).toBe("true");
    expect(add.getAttribute("aria-controls")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cards" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Add something inside" })).toBeNull();
    expect(document.activeElement).toBe(add);
  });

  it("closes the picker on a click outside it, and keeps it for a click inside", () => {
    render(<Rail {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("group", { name: "Add something inside" }));
    expect(screen.getByRole("group", { name: "Add something inside" })).toBeTruthy();
    fireEvent.click(document.body);
    expect(screen.queryByRole("group", { name: "Add something inside" })).toBeNull();
  });

  it("lists items with one-line names", () => {
    const h = props();
    render(<Rail {...h} />);
    const name = screen.getByText(LONG);
    expect(name.classList.contains("ellipsis")).toBe(true);
    expect(name.getAttribute("title")).toBe(LONG);
    fireEvent.click(screen.getByRole("button", { name: /^Market deck,/ }));
    expect(h.onOpenEditor).toHaveBeenCalledWith("a");
  });

  it("shows the rules note only with choices", () => {
    const { rerender } = render(<Rail {...props()} />);
    expect(screen.queryByRole("button", { name: "Clear all my choices" })).toBeNull();
    expect(screen.queryByText(/These stay as you set them/)).toBeNull();
    const h = props({ locks: [pin] });
    rerender(<Rail {...h} />);
    expect(screen.getByText("These stay as you set them when the plan updates.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear all my choices" }));
    expect(h.onClearChoices).toHaveBeenCalledTimes(1);
  });

  it("clears every choice in one undo step", () => {
    const project = { ...fixtureProject(), locks: [pin] };
    const { store } = renderApp({ project });
    fireEvent.click(screen.getByRole("button", { name: "Clear all my choices" }));
    expect(store.state.project.value.locks).toEqual([]);
    expect(screen.queryByRole("button", { name: "Clear all my choices" })).toBeNull();
    act(() => store.undo());
    expect(store.state.project.value.locks).toEqual([pin]);
    expect(screen.getByRole("button", { name: "Clear all my choices" })).toBeTruthy();
  });

  it("shows the printer bed and Settings", () => {
    const h = props();
    render(<Rail {...h} />);
    expect(screen.getByText("Printer bed 256 × 256 mm")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(h.onSettings).toHaveBeenCalledTimes(1);
  });

  it("presses the selected component's row and lights its trays on hover", () => {
    const h = props({ selectedId: "b" });
    render(<Rail {...h} />);
    expect(
      screen.getByRole("button", { name: new RegExp(`^${LONG},`) }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.mouseEnter(screen.getByRole("button", { name: /^Market deck,/ }));
    expect(h.onHover).toHaveBeenLastCalledWith("a");
  });
});

describe("SheetList", () => {
  it("starts with The box, then a compact row a component", () => {
    const h = props();
    const { container } = render(<SheetList {...h} />);
    const rows = within(screen.getByRole("list", { name: "What's inside" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toBe("The box, 285 × 285 × 70 mm");
    expect(container.querySelectorAll(".k-row--compact")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /^The box,/ }));
    expect(h.onOpenBox).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Market deck,/ }));
    expect(h.onOpenEditor).toHaveBeenCalledWith("a");
  });

  it("keeps the rules and the way to lift them while any is set", () => {
    const h = props({ locks: [pin] });
    render(<SheetList {...h} />);
    expect(screen.getByRole("button", { name: "Unpin Market deck" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear all my choices" }));
    expect(h.onClearChoices).toHaveBeenCalledTimes(1);
  });
});
