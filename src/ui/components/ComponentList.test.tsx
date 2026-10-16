// src/ui/components/ComponentList.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTray } from "../../app/test-helpers";
import { newComponent } from "../../model/defaults";
import type { Component, ComponentKind, Lock } from "../../model/types";
import { ValidationContext } from "../validation";
import { ADD_LABELS, ComponentList } from "./ComponentList";

afterEach(cleanup);

const KINDS = Object.keys(ADD_LABELS) as ComponentKind[];

function handlers() {
  return { onAdd: vi.fn(), onOpen: vi.fn(), onUnpin: vi.fn(), onUnlockSize: vi.fn() };
}

const named = (kind: ComponentKind, id: string, name: string): Component => ({
  ...newComponent(kind),
  id,
  name,
});

const pin = (trayKey: string, rotated = false): Lock => ({
  kind: "position",
  trayKey,
  path: "0",
  rotated,
});

describe("ComponentList", () => {
  it("shows a hint and add buttons when empty", () => {
    const h = handlers();
    render(<ComponentList components={[]} {...h} />);
    expect(screen.getByText(/Add what goes in the box/)).toBeTruthy();
    // each Add button carries a small hint, so its name is only matched from the start
    fireEvent.click(screen.getByRole("button", { name: /^Add tokens and dice/ }));
    expect(h.onAdd).toHaveBeenCalledWith("bulk");
    for (const name of [/^Add cards/, /^Add tiles/, /^Add miniatures/, /^Add other item/]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("has a row for every kind, in the kind's colour, and opens it on a click", () => {
    const comps = KINDS.map((k, i) => named(k, `id${i}`, `Thing ${i}`));
    const h = handlers();
    const { container } = render(<ComponentList components={comps} {...h} />);
    expect(container.querySelectorAll(".pf-row")).toHaveLength(5);
    expect(
      (container.querySelector(".pf-row") as HTMLElement).style.getPropertyValue("--shade-fill"),
    ).toMatch(/^light-dark\(#/);
    fireEvent.click(screen.getByRole("button", { name: /^Thing 2,/ }));
    expect(h.onOpen).toHaveBeenCalledWith("id2");
  });

  it("gives two components of one kind their own shades", () => {
    const comps = [named("cards", "a", "Main"), named("cards", "b", "Market")];
    const { container } = render(<ComponentList components={comps} {...handlers()} />);
    const fill = (row: Element) => (row as HTMLElement).style.getPropertyValue("--shade-fill");
    const [first, second] = [...container.querySelectorAll(".pf-row")];
    expect(fill(first as Element)).not.toBe(fill(second as Element));
  });

  it("shows the name, what is in it and a stand-in for an empty name", () => {
    const c = { ...named("cards", "a", "Main deck") };
    const blank = named("custom", "b", "");
    render(<ComponentList components={[c, blank]} {...handlers()} />);
    const row = screen.getByRole("button", { name: /^Main deck,/ });
    expect(within(row).getByText(/^50 cards/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^\(unnamed\),/ })).toBeTruthy();
  });

  it("says Needs attention on the row of a component with an error", () => {
    const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
    render(
      <ValidationContext.Provider
        value={[{ level: "error", code: "x", message: "Bad", path: "/components/1/items/0/w" }]}
      >
        <ComponentList components={comps} {...handlers()} />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("button", { name: /^Gems,\s*Needs attention/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Main,\s*50 cards/ })).toBeTruthy();
  });

  it("puts the Add buttons above the rows", () => {
    const { container } = render(
      <ComponentList components={[named("custom", "a", "Dial")]} {...handlers()} />,
    );
    const kinds = container.querySelector(".pf-kinds") as HTMLElement;
    const row = container.querySelector(".pf-row") as HTMLElement;
    expect(kinds.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the layer of each row once the plan has more than one", () => {
    const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
    const trays = [
      makeTray({ key: "a:p0:0", level: 0, compartments: [{ ...well("a") }] }),
      makeTray({ key: "b:p0:0", level: 1, compartments: [{ ...well("b") }] }),
    ];
    render(<ComponentList components={comps} trays={trays} {...handlers()} />);
    expect(screen.getByRole("button", { name: /^Main,.*Layer 1 \(bottom\)$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Gems,.*Layer 2 \(top\)$/ })).toBeTruthy();
  });

  it("names no layer without a plan, or with a single layer", () => {
    const comps = [named("cards", "a", "Main")];
    const trays = [makeTray({ key: "a:p0:0", compartments: [{ ...well("a") }] })];
    const view = render(<ComponentList components={comps} trays={trays} {...handlers()} />);
    expect(screen.queryByText(/^Layer/)).toBeNull();
    view.rerender(<ComponentList components={comps} {...handlers()} />);
    expect(screen.queryByText(/^Layer/)).toBeNull();
  });

  describe("chips", () => {
    const comps = [named("cards", "a", "Main deck"), named("bulk", "b", "Gems")];

    it("shows Pinned, Pinned, turned and Size locked on the component they belong to", () => {
      const locks: Lock[] = [
        pin("a:p0:0"),
        pin("b:p0:0", true),
        { kind: "size", trayKey: "a:p0:0", w: 1, d: 1, h: 1 },
      ];
      render(<ComponentList components={comps} locks={locks} {...handlers()} />);
      const main = screen.getByRole("listitem", { name: "Main deck" });
      expect(within(main).getByText("Pinned")).toBeTruthy();
      expect(within(main).getByText("Size locked")).toBeTruthy();
      const gems = screen.getByRole("listitem", { name: "Gems" });
      expect(within(gems).getByText("Pinned, turned")).toBeTruthy();
      expect(within(gems).queryByText("Size locked")).toBeNull();
    });

    it("shows one chip for a component whose trays are all pinned", () => {
      const locks: Lock[] = [pin("a:p0:0"), pin("a:p1:0")];
      render(<ComponentList components={comps} locks={locks} {...handlers()} />);
      expect(screen.getAllByText("Pinned")).toHaveLength(1);
    });

    it("removing a Pinned chip unpins the stack", () => {
      const locks: Lock[] = [pin("a:p0:0"), pin("a:p1:0"), pin("b:p0:0")];
      const h = handlers();
      render(<ComponentList components={comps} locks={locks} {...h} />);
      fireEvent.click(screen.getByRole("button", { name: "Unpin Main deck" }));
      expect(h.onUnpin).toHaveBeenCalledWith(["a:p0:0", "a:p1:0"]);
      expect(h.onUnlockSize).not.toHaveBeenCalled();
      expect(h.onOpen).not.toHaveBeenCalled();
    });

    it("says a stack goes with its pin, when the stack has several trays", () => {
      const locks: Lock[] = [
        pin("a:p0:0"),
        pin("b:p0:0"),
        { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] },
      ];
      render(<ComponentList components={comps} locks={locks} {...handlers()} />);
      expect(screen.getByRole("button", { name: "Unpin Main deck and its stack" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Unpin Gems and its stack" })).toBeTruthy();
    });

    it("keeps a lone pin's button plainly Unpin", () => {
      render(<ComponentList components={comps} locks={[pin("a:p0:0")]} {...handlers()} />);
      expect(screen.getByRole("button", { name: "Unpin Main deck" })).toBeTruthy();
    });

    it("moves the focus to the next chip of the row when a chip goes, else to the row", () => {
      const locks: Lock[] = [pin("a:p0:0"), { kind: "size", trayKey: "a:p0:0", w: 1, d: 1, h: 1 }];
      const h = handlers();
      const view = render(<ComponentList components={comps} locks={locks} {...h} />);
      const unpin = screen.getByRole("button", { name: "Unpin Main deck" });
      unpin.focus();
      fireEvent.click(unpin);
      view.rerender(<ComponentList components={comps} locks={[locks[1] as Lock]} {...h} />);
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Unlock size of Main deck" }),
      );
      fireEvent.click(document.activeElement as HTMLElement);
      view.rerender(<ComponentList components={comps} locks={[]} {...h} />);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Main deck,/ }));
    });

    it("forgets a pressed × when its chip stays, so a later change does not steal the focus", () => {
      const locks: Lock[] = [pin("a:p0:0")];
      const h = handlers();
      const view = render(<ComponentList components={comps} locks={locks} {...h} />);
      fireEvent.click(screen.getByRole("button", { name: "Unpin Main deck" }));
      // The click changed nothing here (a blocked change, say): the list renders, chip still there.
      view.rerender(<ComponentList components={comps} locks={[pin("a:p0:0")]} {...h} />);
      (document.activeElement as HTMLElement).blur();
      // Later the pin goes for another reason (another tab, an undo): the focus is not moved.
      view.rerender(<ComponentList components={comps} locks={[]} {...h} />);
      expect(document.activeElement).toBe(document.body);
    });

    it("removing a Size locked chip lifts the size lock", () => {
      const locks: Lock[] = [{ kind: "size", trayKey: "b:p0:0", w: 1, d: 1, h: 1 }];
      const h = handlers();
      render(<ComponentList components={comps} locks={locks} {...h} />);
      fireEvent.click(screen.getByRole("button", { name: "Unlock size of Gems" }));
      expect(h.onUnlockSize).toHaveBeenCalledWith(["b:p0:0"]);
    });

    it("follows a group's key, so each member of the group shows the pin", () => {
      const a = { ...named("bulk", "a", "Cubes"), groupId: "tokens" };
      const b = { ...named("bulk", "b", "Dice"), groupId: "tokens" };
      render(<ComponentList components={[a, b]} locks={[pin("tokens:p0:0")]} {...handlers()} />);
      expect(screen.getAllByText("Pinned")).toHaveLength(2);
    });
  });
});

function well(componentId: string) {
  return {
    x: 1.6,
    y: 1.6,
    w: 50,
    d: 50,
    floorZ: 1.2,
    kind: "well" as const,
    contents: "x",
    features: [],
    componentId,
  };
}
