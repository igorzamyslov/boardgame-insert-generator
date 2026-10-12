// src/ui/components/editors.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type {
  BulkComponent,
  Component,
  CustomComponent,
  MinisComponent,
  Notice,
  TilesComponent,
} from "../../model/types";
import { SizingContext } from "../validation";
import { BulkEditor } from "./BulkEditor";
import { CustomEditor } from "./CustomEditor";
import { MinisEditor } from "./MinisEditor";
import { TilesEditor } from "./TilesEditor";

afterEach(cleanup);

function of<K extends Component["kind"]>(kind: K): Extract<Component, { kind: K }> {
  const c = newComponent(kind);
  if (c.kind !== kind) {
    throw new Error(`expected ${kind}`);
  }
  return { ...(c as Extract<Component, { kind: K }>), id: "x1" };
}

function lastOf<T>(fn: { mock: { calls: T[][] } }): T {
  const call = fn.mock.calls.at(-1);
  if (!call || call[0] === undefined) {
    throw new Error("not called");
  }
  return call[0];
}

describe("BulkEditor", () => {
  it("switches an item to a pile volume and edits it", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    const view = render(
      <BulkEditor component={of("bulk")} index={0} advanced={false} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("How to size item 1"), { target: { value: "volume" } });
    expect(lastOf(onChange).items).toEqual([{ name: "Tokens", volumeMl: 50 }]);
    view.rerender(
      <BulkEditor
        component={{ ...of("bulk"), items: [{ name: "Coins", volumeMl: 50 }] }}
        index={0}
        advanced={false}
        onChange={onChange}
      />,
    );
    fireEvent.input(screen.getByLabelText(/Volume of item 1/), { target: { value: "75,5" } });
    expect(lastOf(onChange).items).toEqual([{ name: "Coins", volumeMl: 75.5 }]);
  });

  it("edits piece sizes and adds items", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    render(<BulkEditor component={of("bulk")} index={0} advanced={false} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText("How many of item 1"), { target: { value: "30" } });
    expect(lastOf(onChange).items[0]).toMatchObject({ count: 30 });
    fireEvent.input(screen.getByLabelText(/Item 1 height/), { target: { value: "2,5" } });
    expect(lastOf(onChange).items[0]).toMatchObject({ h: 2.5 });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(lastOf(onChange).items).toHaveLength(2);
  });
});

describe("TilesEditor", () => {
  it("switches to hexagons and sets the orientation", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    const view = render(
      <TilesEditor component={of("tiles")} index={0} advanced={false} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Tile shape"), { target: { value: "hex" } });
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 40, orientation: "flat" });
    view.rerender(
      <TilesEditor
        component={{ ...of("tiles"), shape: { type: "hex", flatToFlat: 40, orientation: "flat" } }}
        index={0}
        advanced={false}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Hex orientation"), { target: { value: "pointy" } });
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 40, orientation: "pointy" });
    fireEvent.input(screen.getByLabelText(/Hex size/), { target: { value: "45" } });
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 45, orientation: "flat" });
    fireEvent.input(screen.getByLabelText("Number of tiles"), { target: { value: "60" } });
    expect(lastOf(onChange).count).toBe(60);
  });

  it("offers storage under More options", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(<TilesEditor component={of("tiles")} index={0} advanced onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Storage"), { target: { value: "upright" } });
    expect(lastOf(onChange).storage).toBe("upright");
  });
});

describe("MinisEditor", () => {
  it("edits figures and storage", () => {
    const onChange = vi.fn<(c: MinisComponent) => void>();
    render(<MinisEditor component={of("minis")} index={0} advanced onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/Figure 1 height/), { target: { value: "55" } });
    expect(lastOf(onChange).figures[0]).toMatchObject({ h: 55 });
    fireEvent.click(screen.getByRole("button", { name: "Add figure" }));
    expect(lastOf(onChange).figures).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Storage"), { target: { value: "bulk" } });
    expect(lastOf(onChange).storage).toBe("bulk");
  });
});

describe("toggles", () => {
  it("defaults bits to a curved floor without finger cuts, and turns cuts on", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    render(<BulkEditor component={of("bulk")} index={0} advanced={false} onChange={onChange} />);
    expect((screen.getByLabelText("Curved floor") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Finger cuts"));
    expect(lastOf(onChange).fingerCuts).toBe(true);
  });

  it("notes under the toggles that a binned component is stored in a bin", () => {
    const binned: Notice = {
      level: "info",
      code: "sizing.noFingerSlot",
      path: "/components/0",
      message: "Dial: … so it is stored loose in a bin with a curved floor instead.",
    };
    render(
      <SizingContext.Provider value={[binned]}>
        <CustomEditor component={of("custom")} index={0} advanced={false} onChange={vi.fn()} />
      </SizingContext.Provider>,
    );
    expect((screen.getByLabelText("Finger cuts") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/stored loose in a bin with a curved floor/)).toBeTruthy();
  });

  it("offers no curved floor on tiles, and corner reliefs on by default in advanced mode", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(<TilesEditor component={of("tiles")} index={0} advanced onChange={onChange} />);
    expect(screen.queryByLabelText("Curved floor")).toBeNull();
    fireEvent.click(screen.getByLabelText("Corner reliefs"));
    expect(lastOf(onChange).cornerReliefs).toBe(false);
  });
});

describe("CustomEditor", () => {
  it("edits sizes and rejects a fractional count", () => {
    const onChange = vi.fn<(c: CustomComponent) => void>();
    render(
      <CustomEditor component={of("custom")} index={0} advanced={false} onChange={onChange} />,
    );
    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "70" } });
    expect(lastOf(onChange).w).toBe(70);
    fireEvent.input(screen.getByLabelText("How many"), { target: { value: "2,5" } });
    expect(screen.getByRole("alert").textContent).toMatch(/whole number/);
  });
});
