// src/ui/components/editors.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
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
import { SizingContext, ValidationContext } from "../validation";
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
    expect(lastOf(onChange).items).toEqual([{ name: "", volumeMl: 50 }]);
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

  it("offers storage in the Advanced block", () => {
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
    render(<BulkEditor component={of("bulk")} index={0} advanced onChange={onChange} />);
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
        <CustomEditor component={of("custom")} index={0} advanced onChange={vi.fn()} />
      </SizingContext.Provider>,
    );
    expect((screen.getByLabelText("Finger cuts") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/stored loose in a bin with a curved floor/)).toBeTruthy();
  });

  it("shows the bin note even in simple mode, outside the Advanced block", () => {
    const binned: Notice = {
      level: "info",
      code: "sizing.noFingerSlot",
      path: "/components/0",
      message: "Dial: … so it is stored loose in a bin with a curved floor instead.",
    };
    const { container } = render(
      <SizingContext.Provider value={[binned]}>
        <CustomEditor component={of("custom")} index={0} advanced={false} onChange={vi.fn()} />
      </SizingContext.Provider>,
    );
    expect(container.querySelector(".pf-adv")).toBeNull();
    expect(screen.getByText(/stored loose in a bin with a curved floor/)).toBeTruthy();
  });

  it("offers no curved floor on tiles, and corner reliefs on by default in advanced mode", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(<TilesEditor component={of("tiles")} index={0} advanced onChange={onChange} />);
    expect(screen.queryByLabelText("Curved floor")).toBeNull();
    fireEvent.click(screen.getByLabelText("Corner reliefs"));
    expect(lastOf(onChange).cornerReliefs).toBe(false);
  });

  it("offers spacer plates on tiles with stretch on, never on bulk, minis or custom", () => {
    render(<TilesEditor component={of("tiles")} index={0} advanced onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Spacer plates")).toBeNull();
    cleanup();
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(
      <TilesEditor
        component={{ ...of("tiles"), stretch: true }}
        index={0}
        advanced
        onChange={onChange}
      />,
    );
    fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "2" } });
    expect(lastOf(onChange).separators).toBe(2);
    cleanup();
    // a file may set stretch on any kind; only cards and tiles have the option
    for (const [kind, Editor] of [
      ["bulk", BulkEditor],
      ["minis", MinisEditor],
      ["custom", CustomEditor],
    ] as const) {
      const c = { ...of(kind), stretch: true, separators: 3 };
      render(<Editor component={c as never} index={0} advanced onChange={vi.fn()} />);
      expect(screen.queryByLabelText("Spacer plates")).toBeNull();
      cleanup();
    }
  });

  it("says why a plate count was cut back, next to the field", () => {
    const notice: Notice = {
      level: "info",
      code: "separators.reduced",
      message: "Spacer plates for this component: you asked for 5, but 2 fit.",
      path: "/components/0/separators",
    };
    render(
      <SizingContext.Provider value={[notice]}>
        <TilesEditor
          component={{ ...of("tiles"), stretch: true, separators: 5 }}
          index={0}
          advanced
          onChange={vi.fn()}
        />
      </SizingContext.Provider>,
    );
    expect(screen.getByText(/you asked for 5, but 2 fit/)).toBeTruthy();
  });

  it("offers stretch to fill on tiles only, not on bulk, minis or custom", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(<TilesEditor component={of("tiles")} index={0} advanced onChange={onChange} />);
    expect((screen.getByLabelText("Stretch to fill") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Stretch to fill"));
    expect(lastOf(onChange).stretch).toBe(true);
    cleanup();
    render(<BulkEditor component={of("bulk")} index={0} advanced onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Stretch to fill")).toBeNull();
    cleanup();
    render(<MinisEditor component={of("minis")} index={0} advanced onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Stretch to fill")).toBeNull();
    cleanup();
    render(<CustomEditor component={of("custom")} index={0} advanced onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Stretch to fill")).toBeNull();
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

const err = (code: string, path: string, message: string): Notice => ({
  level: "error",
  code,
  path,
  message,
});

describe("validation shown in place", () => {
  it("shows a group name error beside the Group field (collision and colon)", () => {
    render(
      <ValidationContext.Provider
        value={[err("field.groupId", "/components/0/groupId", "A group name can't contain ':'.")]}
      >
        <CustomEditor component={of("custom")} index={0} advanced onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    const group = screen.getByLabelText(/^Group/);
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("A group name can't contain ':'.");
  });

  it("shows a curved floor error on tiles next to the checkbox, tied by aria-describedby", () => {
    const tiles = { ...of("tiles"), curvedFloor: true };
    render(
      <ValidationContext.Provider
        value={[
          err("field.curvedFloor", "/components/0/curvedFloor", "Tiles can't have a curved floor."),
        ]}
      >
        <TilesEditor component={tiles} index={0} advanced onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Tiles can't have a curved floor.");
    const floor = screen.getByLabelText("Curved floor");
    expect(alert.id).not.toBe("");
    expect(floor.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("shows only errors as alerts in the toggles and per-player notes", () => {
    const warn: Notice = {
      level: "warning",
      code: "field.curvedFloor",
      path: "/components/0/curvedFloor",
      message: "Heads up.",
    };
    render(
      <ValidationContext.Provider value={[warn]}>
        <CustomEditor component={of("custom")} index={0} advanced onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Heads up.")).toBeTruthy();
  });

  it("hides the Advanced block in simple mode and shows it in advanced mode", () => {
    const view = render(
      <CustomEditor component={of("custom")} index={0} advanced={false} onChange={vi.fn()} />,
    );
    expect(view.container.querySelector(".pf-adv")).toBeNull();
    for (const label of ["Needed during play", "Finger cuts", /^Group/]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    view.rerender(<CustomEditor component={of("custom")} index={0} advanced onChange={vi.fn()} />);
    expect(view.container.querySelector(".pf-adv")).not.toBeNull();
    expect(screen.getByLabelText("Needed during play")).toBeTruthy();
    expect(screen.getByLabelText("Finger cuts")).toBeTruthy();
  });

  it("shows the Advanced block in simple mode when a field inside has an error", () => {
    const notice = err("field.count", "/components/0/perPlayer/players", "Bad players.");
    const c = { ...of("custom"), perPlayer: { players: 0 } };
    const view = render(
      <CustomEditor component={c} index={0} advanced={false} onChange={vi.fn()} />,
    );
    expect(view.container.querySelector(".pf-adv")).toBeNull();
    view.rerender(
      <ValidationContext.Provider value={[notice]}>
        <CustomEditor component={c} index={0} advanced={false} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    expect(view.container.querySelector(".pf-adv")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Bad players.");
    view.rerender(
      <ValidationContext.Provider value={[]}>
        <CustomEditor component={c} index={0} advanced={false} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    // stays shown once an error brought it up, so it does not vanish under the user fixing it
    expect(view.container.querySelector(".pf-adv")).not.toBeNull();
  });

  it("shows empty-list errors under the Items and Figures legends", () => {
    render(
      <ValidationContext.Provider
        value={[
          err("field.empty", "/components/0/items", "Add at least one item."),
          err("field.empty", "/components/1/figures", "Add at least one figure."),
        ]}
      >
        <BulkEditor
          component={{ ...of("bulk"), items: [] }}
          index={0}
          advanced={false}
          onChange={vi.fn()}
        />
        <MinisEditor
          component={{ ...of("minis"), id: "x2", figures: [] }}
          index={1}
          advanced={false}
          onChange={vi.fn()}
        />
      </ValidationContext.Provider>,
    );
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toEqual(["Add at least one item.", "Add at least one figure."]);
  });

  it("moves focus to Finger cuts when a file-set curved floor on tiles is turned off", () => {
    function Harness() {
      const [c, setC] = useState<TilesComponent>({ ...of("tiles"), curvedFloor: true });
      return <TilesEditor component={c} index={0} advanced onChange={setC} />;
    }
    render(<Harness />);
    const floor = screen.getByLabelText("Curved floor");
    floor.focus();
    fireEvent.click(floor);
    expect(screen.queryByLabelText("Curved floor")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Finger cuts"));
  });
});
