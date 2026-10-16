// src/ui/components/WhatsInside.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent, newProject } from "../../model/defaults";
import type { Component } from "../../model/types";
import { WhatsInside } from "./WhatsInside";

afterEach(cleanup);

const item = (id: string, name: string): Component => ({ ...newComponent("custom"), id, name });
const three = ["a", "b", "c"].map((id) => item(id, `Item ${id}`));

/** What the rail wants besides the components: the box, the printer and the ways out of the list. */
function around() {
  const p = newProject();
  return {
    box: p.box,
    printer: p.printer,
    onOpenBox: vi.fn(),
    onSettings: vi.fn(),
    onClearChoices: vi.fn(),
  };
}

function setup(components: Component[]) {
  const h = { ...around(), onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => true) };
  const view = render(<WhatsInside components={components} {...h} />);
  const rerender = (next: Component[]) => view.rerender(<WhatsInside components={next} {...h} />);
  return { ...h, rerender };
}

/** The Add pill, then one of the kinds it offers. */
function addKind(name: string): void {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(screen.getByRole("button", { name }));
}

const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

describe("WhatsInside", () => {
  it("shows the list, and a row opens its editor in the place of the list", () => {
    setup(three);
    expect(screen.queryByRole("heading", { name: "Item b" })).toBeNull();
    fireEvent.click(row("Item b"));
    expect(screen.getByRole("heading", { name: "Item b" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("list", { name: "What's inside" })).toBeNull();
  });

  it("lists The box first and compact rows on a phone, where the Add pill is the sheet's", () => {
    const h = { ...around(), onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => true) };
    render(<WhatsInside components={three} phone {...h} />);
    const rows = within(screen.getByRole("list", { name: "What's inside" })).getAllByRole(
      "listitem",
    );
    expect(rows[0]?.textContent).toMatch(/^The box,/);
    expect(rows).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    fireEvent.click(row("The box"));
    expect(h.onOpenBox).toHaveBeenCalledTimes(1);
    fireEvent.click(row("Item b"));
    expect(screen.getByRole("heading", { name: "Item b" })).toBeTruthy();
  });

  it("returns to the list from Done, with the focus on the row it came from", () => {
    setup(three);
    fireEvent.click(row("Item b"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("list", { name: "What's inside" })).toBeTruthy();
    expect(document.activeElement).toBe(row("Item b"));
  });

  it("opens the editor the caller names, and reports a row opened or a way back", () => {
    const h = { ...around(), onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => true) };
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
    addKind("Something else");
    rerender(three.slice(0, 2));
    expect(screen.getByRole("heading", { name: "Item b" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    addKind("Something else");
    rerender([...three.slice(0, 2), item("d", "Item d"), item("e", "Item e")]);
    expect(screen.queryByRole("heading", { name: /^Item [de]$/ })).toBeNull();
  });

  it("does not open an editor, or take the focus, for an item that turns up without an Add", () => {
    // another project with one unseen item, or an Undo that brings one back
    const { rerender } = setup(three);
    const menu = document.createElement("button");
    document.body.append(menu);
    menu.focus();
    rerender([item("z", "Item z")]);
    expect(screen.queryByRole("heading", { name: "Item z" })).toBeNull();
    expect(screen.getByRole("list", { name: "What's inside" })).toBeTruthy();
    expect(document.activeElement).toBe(menu);
    rerender([item("z", "Item z"), item("y", "Item y")]);
    expect(screen.queryByRole("heading", { name: "Item y" })).toBeNull();
    menu.remove();
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

    it("puts the focus on the Add pill when nothing is left", () => {
      const { rerender } = setup(three.slice(0, 1));
      fireEvent.click(row("Item a"));
      remove("Item a");
      rerender([]);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add" }));
    });

    it("stays in the editor when the removal did not happen", () => {
      const h = { ...around(), onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => false) };
      render(<WhatsInside components={three} {...h} />);
      fireEvent.click(row("Item b"));
      remove("Item b");
      expect(screen.getByRole("heading", { name: "Item b" })).toBeTruthy();
    });
  });
});
