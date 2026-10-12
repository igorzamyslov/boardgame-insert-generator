// src/ui/components/ComponentList.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { Component, ComponentKind } from "../../model/types";
import { ADD_LABELS, ComponentList } from "./ComponentList";

afterEach(cleanup);

const KINDS = Object.keys(ADD_LABELS) as ComponentKind[];

function handlers() {
  return { onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => true) };
}

describe("ComponentList", () => {
  it("shows a hint and add buttons when empty", () => {
    const h = handlers();
    render(<ComponentList components={[]} advanced={false} {...h} />);
    expect(screen.getByText(/Add what goes in the box/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add bits" }));
    expect(h.onAdd).toHaveBeenCalledWith("bulk");
    for (const name of ["Add cards", "Add tiles", "Add miniatures", "Add other item"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("renders the right editor for every kind", () => {
    const comps: Component[] = KINDS.map((k) => newComponent(k));
    render(<ComponentList components={comps} advanced={false} {...handlers()} />);
    expect(screen.getByLabelText("Card size")).toBeTruthy();
    expect(screen.getByLabelText("How to size item 1")).toBeTruthy();
    expect(screen.getByLabelText("Tile shape")).toBeTruthy();
    expect(screen.getByLabelText(/Figure 1 height/)).toBeTruthy();
    expect(screen.getByLabelText("How many")).toBeTruthy();
    expect(screen.getAllByRole("region")).toHaveLength(5);
  });

  it("renames, sets access and removes", () => {
    const c = { ...newComponent("cards"), name: "Main deck" };
    const h = handlers();
    render(<ComponentList components={[c]} advanced={false} {...h} />);
    expect(screen.getByRole("heading", { name: "Cards: Main deck" })).toBeTruthy();
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Market" } });
    expect(h.onChange).toHaveBeenLastCalledWith(c.id, { ...c, name: "Market" });
    fireEvent.change(screen.getByLabelText("Needed during play"), { target: { value: "often" } });
    expect(h.onChange).toHaveBeenLastCalledWith(c.id, { ...c, access: "often" });
    fireEvent.click(screen.getByRole("button", { name: "Remove component 1 (Cards: Main deck)" }));
    expect(h.onRemove).toHaveBeenCalledWith(c.id);
  });

  it("gives each remove button a unique name, even for empty or duplicate names", () => {
    const a = { ...newComponent("custom"), id: "a", name: "" };
    const b = { ...newComponent("custom"), id: "b", name: "Dial" };
    const d = { ...newComponent("custom"), id: "d", name: "Dial" };
    const h = handlers();
    render(<ComponentList components={[a, b, d]} advanced={false} {...h} />);
    const names = screen.getAllByRole("button", { name: /^Remove / }).map((x) => x.ariaLabel);
    expect(names).toEqual([
      "Remove component 1 (Item: (unnamed))",
      "Remove component 2 (Item: Dial)",
      "Remove component 3 (Item: Dial)",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Remove component 3 (Item: Dial)" }));
    expect(h.onRemove).toHaveBeenCalledWith("d");
  });

  describe("focus after a removal", () => {
    const three = ["a", "b", "c"].map((id) => ({
      ...newComponent("custom"),
      id,
      name: `Item ${id}`,
    }));

    function setup(components: Component[]) {
      const h = handlers();
      const view = render(<ComponentList components={components} advanced={false} {...h} />);
      const rerender = (next: Component[]) =>
        view.rerender(<ComponentList components={next} advanced={false} {...h} />);
      return { rerender };
    }

    const removeButton = (n: number) =>
      screen.getByRole("button", { name: new RegExp(`^Remove component ${n} `) });

    it("moves to the heading of the card that took the place of the removed one", () => {
      const { rerender } = setup(three);
      removeButton(2).focus();
      fireEvent.click(removeButton(2));
      rerender([three[0] as Component, three[2] as Component]);
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: /Item c/ }));
    });

    it("moves to the new last card when the last one was removed", () => {
      const { rerender } = setup(three);
      removeButton(3).focus();
      fireEvent.click(removeButton(3));
      rerender(three.slice(0, 2));
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: /Item b/ }));
    });

    it("moves to the Add buttons when the list is empty now", () => {
      const only = three.slice(0, 1);
      const { rerender } = setup(only);
      removeButton(1).focus();
      fireEvent.click(removeButton(1));
      rerender([]);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add cards" }));
    });

    it("forgets a declined removal, so a later change of the list doesn't take the focus", () => {
      const h = handlers();
      h.onRemove.mockReturnValue(false);
      const view = render(<ComponentList components={three} advanced={false} {...h} />);
      removeButton(2).focus();
      fireEvent.click(removeButton(2));
      expect(h.onRemove).toHaveBeenCalledWith("b");
      // another project is opened: the list loses "b" for a reason that has nothing to do with it
      view.rerender(<ComponentList components={[three[0] as Component]} advanced={false} {...h} />);
      expect(document.activeElement).not.toBe(screen.getByRole("heading", { name: /Item a/ }));
    });

    it("leaves the focus alone when the removal was declined", () => {
      const { rerender } = setup(three);
      removeButton(2).focus();
      fireEvent.click(removeButton(2));
      rerender(three.map((c) => (c.id === "a" ? { ...c, name: "Renamed" } : c)));
      expect(document.activeElement).toBe(removeButton(2));
    });
  });
});
