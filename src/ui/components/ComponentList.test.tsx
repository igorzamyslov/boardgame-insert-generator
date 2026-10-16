// src/ui/components/ComponentList.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { Component, ComponentKind } from "../../model/types";
import { ADD_LABELS, ComponentList } from "./ComponentList";

afterEach(cleanup);

/** The one-line name of a folded card (the title element, which also takes the focus). */
const titleOf = (name: string | RegExp) => screen.getByText(name, { selector: ".pf-item__title" });

const KINDS = Object.keys(ADD_LABELS) as ComponentKind[];

function handlers() {
  return { onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn(() => true) };
}

describe("ComponentList", () => {
  it("shows a hint and add buttons when empty", () => {
    const h = handlers();
    render(<ComponentList components={[]} {...h} />);
    expect(screen.getByText(/Add what goes in the box/)).toBeTruthy();
    // each Add button carries a small hint, so its name is only matched from the start
    fireEvent.click(screen.getByRole("button", { name: /^Add bits/ }));
    expect(h.onAdd).toHaveBeenCalledWith("bulk");
    for (const name of [/^Add cards/, /^Add tiles/, /^Add miniatures/, /^Add other item/]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("renders the right editor for every kind", () => {
    const comps: Component[] = KINDS.map((k) => newComponent(k));
    const { container } = render(<ComponentList components={comps} {...handlers()} />);
    expect(screen.getByLabelText("Card size")).toBeTruthy();
    expect(screen.getByLabelText("How to size item 1")).toBeTruthy();
    expect(screen.getByLabelText("Tile shape")).toBeTruthy();
    expect(screen.getByLabelText(/Figure 1 height/)).toBeTruthy();
    expect(screen.getByLabelText("How many")).toBeTruthy();
    expect(container.querySelectorAll("details.component-card")).toHaveLength(5);
  });

  it("renames, sets access and removes", () => {
    const c = { ...newComponent("cards"), name: "Main deck" };
    const h = handlers();
    render(<ComponentList components={[c]} {...h} />);
    expect(titleOf("Main deck")).toBeTruthy();
    expect(screen.getByText(/^50 cards/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Market" } });
    expect(h.onChange).toHaveBeenLastCalledWith(c.id, { ...c, name: "Market" });
    fireEvent.change(screen.getByLabelText("Needed during play"), { target: { value: "often" } });
    expect(h.onChange).toHaveBeenLastCalledWith(c.id, { ...c, access: "often" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Main deck" }));
    expect(h.onRemove).toHaveBeenCalledWith(c.id);
  });

  it("puts the Add buttons above the cards and shows the trays a card makes", () => {
    const a = { ...newComponent("custom"), id: "a", name: "Dial" };
    const b = { ...newComponent("custom"), id: "b", name: "Die" };
    const trays = new Map([
      [0, [3]],
      [1, [1, 4]],
    ]);
    const { container } = render(
      <ComponentList components={[a, b]} trayNumbers={trays} {...handlers()} />,
    );
    const kinds = container.querySelector(".pf-kinds") as HTMLElement;
    const card = container.querySelector(".component-card") as HTMLElement;
    expect(kinds.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/ · tray 3$/)).toBeTruthy();
    expect(screen.getByText(/ · trays 1, 4$/)).toBeTruthy();
  });

  it("keeps one card open at a time and opens a newly added one", () => {
    const a = { ...newComponent("custom"), id: "a", name: "Dial" };
    const b = { ...newComponent("custom"), id: "b", name: "Die" };
    const h = handlers();
    const view = render(<ComponentList components={[a]} {...h} />);
    const cardOf = (name: string) => titleOf(name).closest("details") as HTMLDetailsElement;
    expect(cardOf("Dial").open).toBe(false);
    view.rerender(<ComponentList components={[a, b]} {...h} />);
    expect(cardOf("Die").open).toBe(true);
    expect(cardOf("Dial").open).toBe(false);
    cardOf("Dial").open = true;
    fireEvent(cardOf("Dial"), new Event("toggle"));
    expect(cardOf("Dial").open).toBe(true);
    expect(cardOf("Die").open).toBe(false);
  });

  it("names each remove button after its card, with a stand-in for an empty name and the position for a repeated one", () => {
    const a = { ...newComponent("custom"), id: "a", name: "" };
    const b = { ...newComponent("custom"), id: "b", name: "Dial" };
    const d = { ...newComponent("custom"), id: "d", name: "Dial" };
    const h = handlers();
    render(<ComponentList components={[a, b, d]} {...h} />);
    const names = screen.getAllByRole("button", { name: /^Remove / }).map((x) => x.ariaLabel);
    // Two cards share a name: their buttons say which one by position.
    expect(names).toEqual(["Remove (unnamed)", "Remove Dial (item 2)", "Remove Dial (item 3)"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Dial (item 3)" }));
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
      const view = render(<ComponentList components={components} {...h} />);
      const rerender = (next: Component[]) =>
        view.rerender(<ComponentList components={next} {...h} />);
      return { rerender };
    }

    const removeButton = (n: number) =>
      screen.getByRole("button", { name: `Remove Item ${"abc"[n - 1]}` });

    it("moves to the title of the card that took the place of the removed one", () => {
      const { rerender } = setup(three);
      removeButton(2).focus();
      fireEvent.click(removeButton(2));
      rerender([three[0] as Component, three[2] as Component]);
      expect(document.activeElement).toBe(titleOf(/Item c/));
    });

    it("moves to the new last card when the last one was removed", () => {
      const { rerender } = setup(three);
      removeButton(3).focus();
      fireEvent.click(removeButton(3));
      rerender(three.slice(0, 2));
      expect(document.activeElement).toBe(titleOf(/Item b/));
    });

    it("moves to the Add buttons when the list is empty now", () => {
      const only = three.slice(0, 1);
      const { rerender } = setup(only);
      removeButton(1).focus();
      fireEvent.click(removeButton(1));
      rerender([]);
      expect(document.activeElement).toBe(document.querySelector(".pf-kinds button"));
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Add cards/ }));
    });

    it("forgets a declined removal, so a later change of the list doesn't take the focus", () => {
      const h = handlers();
      h.onRemove.mockReturnValue(false);
      const view = render(<ComponentList components={three} {...h} />);
      removeButton(2).focus();
      fireEvent.click(removeButton(2));
      expect(h.onRemove).toHaveBeenCalledWith("b");
      // another project is opened: the list loses "b" for a reason that has nothing to do with it
      view.rerender(<ComponentList components={[three[0] as Component]} {...h} />);
      expect(document.activeElement).not.toBe(titleOf(/Item a/));
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
