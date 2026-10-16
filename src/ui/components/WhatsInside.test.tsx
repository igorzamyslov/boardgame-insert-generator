// src/ui/components/WhatsInside.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { Component } from "../../model/types";
import { WhatsInside } from "./WhatsInside";

afterEach(cleanup);

const item = (id: string, name: string): Component => ({ ...newComponent("custom"), id, name });
const three = ["a", "b", "c"].map((id) => item(id, `Item ${id}`));

function setup(components: Component[]) {
  const h = { onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => true) };
  const view = render(<WhatsInside components={components} {...h} />);
  const rerender = (next: Component[]) => view.rerender(<WhatsInside components={next} {...h} />);
  return { ...h, rerender };
}

const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

describe("WhatsInside", () => {
  it("shows the list, and a row opens its editor in the place of the list", () => {
    setup(three);
    expect(screen.queryByRole("heading", { name: "Item b" })).toBeNull();
    fireEvent.click(row("Item b"));
    expect(screen.getByRole("heading", { name: "Item b" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Add cards/ })).toBeNull();
    expect(screen.queryByRole("list", { name: "What's inside" })).toBeNull();
  });

  it("returns to the list from Done, with the focus on the row it came from", () => {
    setup(three);
    fireEvent.click(row("Item b"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("list", { name: "What's inside" })).toBeTruthy();
    expect(document.activeElement).toBe(row("Item b"));
  });

  it("opens the editor the caller names, and reports a row opened or a way back", () => {
    const h = { onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => true) };
    const onOpenChange = vi.fn();
    const view = render(
      <WhatsInside components={three} {...h} openId={null} onOpenChange={onOpenChange} />,
    );
    fireEvent.click(row("Item b"));
    expect(onOpenChange).toHaveBeenLastCalledWith("b");
    // Still the list until the caller says otherwise.
    expect(screen.queryByRole("heading", { name: "Item b" })).toBeNull();
    view.rerender(<WhatsInside components={three} {...h} openId="c" onOpenChange={onOpenChange} />);
    expect(screen.getByRole("heading", { name: "Item c" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(null);
  });

  it("passes edits on with the component's id", () => {
    const { onChange } = setup(three);
    fireEvent.click(row("Item c"));
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Dial" } });
    expect(onChange).toHaveBeenLastCalledWith("c", { ...three[2], name: "Dial" });
  });

  it("opens a component as soon as it is added, and not when several are", () => {
    const { rerender } = setup(three.slice(0, 1));
    rerender(three.slice(0, 2));
    expect(screen.getByRole("heading", { name: "Item b" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    rerender([...three.slice(0, 2), item("d", "Item d"), item("e", "Item e")]);
    expect(screen.queryByRole("heading", { name: /^Item [de]$/ })).toBeNull();
  });

  it("goes back to the list when the open component goes away", () => {
    const { rerender } = setup(three);
    fireEvent.click(row("Item b"));
    rerender([three[0] as Component, three[2] as Component]);
    expect(screen.getByRole("list", { name: "What's inside" })).toBeTruthy();
  });

  describe("after a removal", () => {
    function remove(name: string): void {
      fireEvent.click(screen.getByRole("button", { name: `Remove ${name}…` }));
      fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
    }

    it("puts the focus on the row that took its place", () => {
      const { onRemove, rerender } = setup(three);
      fireEvent.click(row("Item b"));
      remove("Item b");
      expect(onRemove).toHaveBeenCalledWith("b");
      rerender([three[0] as Component, three[2] as Component]);
      expect(document.activeElement).toBe(row("Item c"));
    });

    it("puts the focus on the new last row when the last one went", () => {
      const { rerender } = setup(three);
      fireEvent.click(row("Item c"));
      remove("Item c");
      rerender(three.slice(0, 2));
      expect(document.activeElement).toBe(row("Item b"));
    });

    it("puts the focus on the Add buttons when nothing is left", () => {
      const { rerender } = setup(three.slice(0, 1));
      fireEvent.click(row("Item a"));
      remove("Item a");
      rerender([]);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Add cards/ }));
    });

    it("stays in the editor when the removal did not happen", () => {
      const h = { onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => false) };
      render(<WhatsInside components={three} {...h} />);
      fireEvent.click(row("Item b"));
      remove("Item b");
      expect(screen.getByRole("heading", { name: "Item b" })).toBeTruthy();
    });
  });
});
