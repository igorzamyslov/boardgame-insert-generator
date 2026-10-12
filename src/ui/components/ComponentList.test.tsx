// src/ui/components/ComponentList.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { Component, ComponentKind } from "../../model/types";
import { ComponentList } from "./ComponentList";

afterEach(cleanup);

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

function handlers() {
  return { onAdd: vi.fn(), onChange: vi.fn(), onRemove: vi.fn() };
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
    fireEvent.click(screen.getByRole("button", { name: "Remove Main deck" }));
    expect(h.onRemove).toHaveBeenCalledWith(c.id);
  });
});
