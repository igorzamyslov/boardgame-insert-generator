// src/ui/components/editors.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { CardsEditor } from "./CardsEditor";
import { CustomEditor } from "./CustomEditor";
import { MinisEditor } from "./MinisEditor";
import { TilesEditor } from "./TilesEditor";
import { choose, lastOf, of, openMore, openRows, pressedIn } from "./test-editors";

afterEach(cleanup);

type AnyEditor = (p: { component: Component; index: number; onChange: () => void }) => JSX.Element;

const EDITORS = {
  cards: CardsEditor,
  bulk: BulkEditor,
  tiles: TilesEditor,
  minis: MinisEditor,
  custom: CustomEditor,
} as const;

describe("BulkEditor", () => {
  it("switches a piece to a pile volume and edits it", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    const view = render(<BulkEditor component={of("bulk")} index={0} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Don't know the size? Give a volume instead" }),
    );
    expect(lastOf(onChange).items).toEqual([{ name: "", volumeMl: 50 }]);
    view.rerender(
      <BulkEditor
        component={{ ...of("bulk"), items: [{ name: "Coins", volumeMl: 50 }] }}
        index={0}
        onChange={onChange}
      />,
    );
    fireEvent.input(screen.getByLabelText(/Volume ml/), { target: { value: "75,5" } });
    expect(lastOf(onChange).items).toEqual([{ name: "Coins", volumeMl: 75.5 }]);
    // and back to a count and a size
    fireEvent.click(screen.getByRole("button", { name: /Give a count and a size instead/ }));
    expect(lastOf(onChange).items[0]).toMatchObject({ name: "Coins", count: 10 });
  });

  it("edits piece sizes and adds pieces", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    render(<BulkEditor component={of("bulk")} index={0} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText("How many of piece 1"), { target: { value: "30" } });
    expect(lastOf(onChange).items[0]).toMatchObject({ count: 30 });
    fireEvent.input(screen.getByLabelText(/Height mm of piece 1/), { target: { value: "2,5" } });
    expect(lastOf(onChange).items[0]).toMatchObject({ h: 2.5 });
    fireEvent.click(screen.getByRole("button", { name: "+ Another kind of piece" }));
    expect(lastOf(onChange).items).toHaveLength(2);
  });

  it("offers no way to store the pieces in one bin: the engine has none", () => {
    render(<BulkEditor component={of("bulk")} index={0} onChange={vi.fn()} />);
    expect(screen.queryByText(/How they're stored/)).toBeNull();
  });
});

describe("TilesEditor", () => {
  it("switches to hexagons and sets the way up", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    const view = render(<TilesEditor component={of("tiles")} index={0} onChange={onChange} />);
    expect(pressedIn("Shape")).toBe("Square");
    choose("Shape", "Hex");
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 40, orientation: "flat" });
    view.rerender(
      <TilesEditor
        component={{ ...of("tiles"), shape: { type: "hex", flatToFlat: 40, orientation: "flat" } }}
        index={0}
        onChange={onChange}
      />,
    );
    choose("Which way up", "Point on top");
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 40, orientation: "pointy" });
    fireEvent.input(screen.getByLabelText(/Across the flat sides/), { target: { value: "45" } });
    expect(lastOf(onChange).shape).toEqual({ type: "hex", flatToFlat: 45, orientation: "flat" });
    fireEvent.input(screen.getByLabelText("Number of tiles"), { target: { value: "60" } });
    expect(lastOf(onChange).count).toBe(60);
  });

  it("draws a square from one side and a rectangle from two", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    const view = render(<TilesEditor component={of("tiles")} index={0} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/^Side mm/), { target: { value: "60" } });
    expect(lastOf(onChange).shape).toEqual({ type: "rect", w: 60, d: 60 });
    view.rerender(<TilesEditor component={lastOf(onChange)} index={0} onChange={onChange} />);
    choose("Shape", "Rectangle");
    // a rectangle keeps the sides it had; the two fields appear
    view.rerender(<TilesEditor component={lastOf(onChange)} index={0} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/^Depth mm/), { target: { value: "90" } });
    expect(lastOf(onChange).shape).toEqual({ type: "rect", w: 60, d: 90 });
  });

  it("says how tiles stand among the basics, and keeps nothing else about storage", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(<TilesEditor component={of("tiles")} index={0} onChange={onChange} />);
    expect(pressedIn("Tiles stand")).toBe("Auto");
    choose("Tiles stand", "Upright");
    expect(lastOf(onChange).storage).toBe("upright");
  });
});

describe("MinisEditor", () => {
  it("edits figures and how they are stored", () => {
    const onChange = vi.fn<(c: MinisComponent) => void>();
    render(<MinisEditor component={of("minis")} index={0} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/Tall.* figure 1/), { target: { value: "55" } });
    expect(lastOf(onChange).figures[0]).toMatchObject({ h: 55 });
    fireEvent.input(screen.getByLabelText("Name of figure 1"), { target: { value: "Hero" } });
    expect(lastOf(onChange).figures[0]).toMatchObject({ name: "Hero" });
    fireEvent.click(screen.getByRole("button", { name: "+ Another size of figure" }));
    expect(lastOf(onChange).figures).toHaveLength(2);
    choose("How they're stored", "Loose in a tray");
    expect(lastOf(onChange).storage).toBe("bulk");
  });

  it("counts a figure with the stepper, and offers a × only while there are two", () => {
    const onChange = vi.fn<(c: MinisComponent) => void>();
    const one = { ...of("minis"), figures: [{ name: "Hero", w: 30, d: 30, h: 38, count: 6 }] };
    const view = render(<MinisEditor component={one} index={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(lastOf(onChange).figures[0]).toMatchObject({ count: 7 });
    expect(screen.queryByRole("button", { name: /^Remove figure/ })).toBeNull();
    const two = {
      ...one,
      figures: [...one.figures, { name: "Orc", w: 30, d: 30, h: 38, count: 2 }],
    };
    view.rerender(<MinisEditor component={two} index={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove figure Orc" }));
    expect(lastOf(onChange).figures).toEqual(one.figures);
  });
});

describe("toggles", () => {
  it("defaults tokens to a curved floor without finger cuts, and turns cuts on", () => {
    const onChange = vi.fn<(c: BulkComponent) => void>();
    render(<BulkEditor component={of("bulk")} index={0} onChange={onChange} />);
    openMore();
    const chip = (name: string) => screen.getByRole("button", { name });
    expect(chip("Curved floor").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Finger cuts").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip("Finger cuts"));
    expect(lastOf(onChange).fingerCuts).toBe(true);
  });

  it("notes under the basics that a binned component is stored in a bin", () => {
    const binned: Notice = {
      level: "info",
      code: "sizing.noFingerSlot",
      path: "/components/0",
      message: "Dial: … so it is stored loose in a tray with a curved floor instead.",
    };
    render(
      <SizingContext.Provider value={[binned]}>
        <CustomEditor component={of("custom")} index={0} onChange={vi.fn()} />
      </SizingContext.Provider>,
    );
    openMore();
    expect(screen.getByRole("button", { name: "Finger cuts" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    const note = screen.getByText(/stored loose in a tray with a curved floor/);
    // outside More options: in the basics, where it is read first
    expect(note.closest(".k-disclosure")).toBeNull();
  });

  it("offers no curved floor on tiles, and corner holes on by default", () => {
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(<TilesEditor component={of("tiles")} index={0} onChange={onChange} />);
    openMore();
    expect(screen.queryByRole("button", { name: "Curved floor" })).toBeNull();
    const holes = screen.getByRole("button", { name: "Corner holes" });
    expect(holes.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(holes);
    expect(lastOf(onChange).cornerReliefs).toBe(false);
  });

  it("offers spacer plates on tiles while the stack may grow, never on tokens, figures or others", () => {
    render(
      <TilesEditor
        component={{ ...of("tiles"), growth: { stack: "off" } }}
        index={0}
        onChange={vi.fn()}
      />,
    );
    openRows();
    expect(screen.queryByLabelText("Spacer plates")).toBeNull();
    cleanup();
    const onChange = vi.fn<(c: TilesComponent) => void>();
    render(
      <TilesEditor
        component={{ ...of("tiles"), storage: "upright" }}
        index={0}
        onChange={onChange}
      />,
    );
    openRows();
    fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "2" } });
    expect(lastOf(onChange).separators).toBe(2);
    cleanup();
    // a file may set separators on any kind; only cards and tiles have the option
    for (const kind of ["bulk", "minis", "custom"] as const) {
      const Editor = EDITORS[kind] as unknown as AnyEditor;
      render(<Editor component={{ ...of(kind), separators: 3 }} index={0} onChange={vi.fn()} />);
      openRows();
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
          component={{ ...of("tiles"), storage: "upright", separators: 5 }}
          index={0}
          onChange={vi.fn()}
        />
      </SizingContext.Provider>,
    );
    openRows();
    expect(screen.getByText(/you asked for 5, but 2 fit/)).toBeTruthy();
  });

  it("never offers Keep it next to: the engine has no such rule yet", () => {
    for (const kind of Object.keys(EDITORS) as (keyof typeof EDITORS)[]) {
      const Editor = EDITORS[kind] as unknown as AnyEditor;
      render(<Editor component={of(kind)} index={0} onChange={vi.fn()} />);
      openRows();
      expect(document.body.textContent, kind).not.toContain("Keep it next to");
      expect(screen.queryByRole("button", { name: "Choose…" }), kind).toBeNull();
      cleanup();
    }
  });

  describe("room to grow, by kind (minimal-trays spec §5)", () => {
    const groups = (): string[] =>
      Array.from(document.querySelectorAll<HTMLElement>('[role="group"]'))
        .map((g) => g.getAttribute("aria-label") ?? "")
        .filter((n) => /^(Room for expansions|Extra |Looser pockets)/.test(n));

    it("offers tiles one choice, along the stack, auto when they stand up and none when they lie", () => {
      const onChange = vi.fn<(c: TilesComponent) => void>();
      render(
        <TilesEditor
          component={{ ...of("tiles"), storage: "upright" }}
          index={0}
          onChange={onChange}
        />,
      );
      openMore();
      expect(groups()).toEqual(["Room for expansions"]);
      expect(pressedIn("Room for expansions")).toBe("Auto");
      choose("Room for expansions", "Max");
      expect(lastOf(onChange).growth).toEqual({ stack: "max" });
      cleanup();
      render(
        <TilesEditor
          component={{ ...of("tiles"), storage: "flat" }}
          index={0}
          onChange={vi.fn()}
        />,
      );
      openMore();
      expect(pressedIn("Room for expansions")).toBe("None");
    });

    it("offers tokens all three axes, auto by default, each stored on its own", () => {
      const onChange = vi.fn<(c: BulkComponent) => void>();
      render(<BulkEditor component={of("bulk")} index={0} onChange={onChange} />);
      openMore();
      expect(groups()).toEqual(["Extra width", "Extra length", "Extra height"]);
      for (const g of groups()) {
        expect(pressedIn(g)).toBe("Auto");
      }
      choose("Extra length", "None");
      expect(lastOf(onChange).growth).toEqual({ d: "off" });
    });

    it("offers figures in pockets only width and length, none by default: a pocket's depth is a figure's height", () => {
      render(<MinisEditor component={of("minis")} index={0} onChange={vi.fn()} />);
      openMore();
      expect(groups()).toEqual(["Looser pockets: width", "Looser pockets: length"]);
      expect(pressedIn("Looser pockets: width")).toBe("None");
      expect(screen.queryByRole("group", { name: /Looser pockets: (height|depth)/ })).toBeNull();
    });

    it("offers figures stored loose all three, auto", () => {
      render(
        <MinisEditor
          component={{ ...of("minis"), storage: "bulk" }}
          index={0}
          onChange={vi.fn()}
        />,
      );
      openMore();
      expect(groups()).toEqual(["Extra width", "Extra length", "Extra height"]);
      expect(pressedIn("Extra height")).toBe("Auto");
    });

    it("offers a custom well all three, none by default", () => {
      render(<CustomEditor component={of("custom")} index={0} onChange={vi.fn()} />);
      openMore();
      expect(groups()).toEqual(["Extra width", "Extra length", "Extra height"]);
      expect(pressedIn("Extra width")).toBe("None");
    });

    it("keeps them under More options", () => {
      render(<BulkEditor component={of("bulk")} index={0} onChange={vi.fn()} />);
      expect(groups()).toEqual([]);
      openMore();
      expect(groups().length).toBeGreaterThan(0);
    });
  });
});

describe("CustomEditor", () => {
  it("edits sizes and takes a count by whole numbers only", () => {
    const onChange = vi.fn<(c: CustomComponent) => void>();
    render(<CustomEditor component={of("custom")} index={0} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText(/^Width mm/), { target: { value: "70" } });
    expect(lastOf(onChange).w).toBe(70);
    onChange.mockClear();
    fireEvent.input(screen.getByLabelText("Number of items"), { target: { value: "2,5" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(lastOf(onChange).count).toBe(2);
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
        <CustomEditor component={of("custom")} index={0} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    // the row opens by itself: the error is in sight
    const group = screen.getByLabelText(/^Group/);
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("A group name can't contain ':'.");
  });

  it("shows a curved floor error on tiles by the chips, tied by aria-describedby", () => {
    const tiles = { ...of("tiles"), curvedFloor: true };
    render(
      <ValidationContext.Provider
        value={[
          err("field.curvedFloor", "/components/0/curvedFloor", "Tiles can't have a curved floor."),
        ]}
      >
        <TilesEditor component={tiles} index={0} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Tiles can't have a curved floor.");
    const shape = screen.getByRole("group", { name: "Tray shape" });
    expect(alert.id).not.toBe("");
    expect(shape.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("shows only errors as alerts, and warnings as plain notes", () => {
    const warn: Notice = {
      level: "warning",
      code: "field.curvedFloor",
      path: "/components/0/curvedFloor",
      message: "Heads up.",
    };
    render(
      <ValidationContext.Provider value={[warn]}>
        <CustomEditor component={of("custom")} index={0} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    openMore();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Heads up.")).toBeTruthy();
  });

  it("folds the optional fields under More options, closed by default", () => {
    render(<CustomEditor component={of("custom")} index={0} onChange={vi.fn()} />);
    const more = screen.getByRole("button", { name: /^More options/ });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "How often you reach for it" })).toBeNull();
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(more.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(within(panel).getByRole("group", { name: "How often you reach for it" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Finger cuts" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Group" })).toBeTruthy();
  });

  it("opens More options when a field inside has an error, and keeps it open", () => {
    const notice = err("field.count", "/components/0/perPlayer/players", "Bad players.");
    const c = { ...of("custom"), perPlayer: { players: 0 } };
    const more = () => screen.getByRole("button", { name: /^More options/ });
    const view = render(<CustomEditor component={c} index={0} onChange={vi.fn()} />);
    expect(more().getAttribute("aria-expanded")).toBe("false");
    view.rerender(
      <ValidationContext.Provider value={[notice]}>
        <CustomEditor component={c} index={0} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    expect(more().getAttribute("aria-expanded")).toBe("true");
    // and so is the row: the message is on the page, in no closed panel
    expect(screen.getByRole("alert").textContent).toBe("Bad players.");
    view.rerender(
      <ValidationContext.Provider value={[]}>
        <CustomEditor component={c} index={0} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    // stays open once an error brought it up, so it does not vanish under the person mending it
    expect(more().getAttribute("aria-expanded")).toBe("true");
  });

  describe.each(Object.keys(EDITORS) as (keyof typeof EDITORS)[])("More options of %s", (kind) => {
    const Editor = EDITORS[kind] as unknown as AnyEditor;
    const more = () => screen.getByRole("button", { name: /^More options/ });

    it.each([
      "groupId",
      "perPlayer/players",
      "clearance",
      "curvedFloor",
      "separators",
      "dividers",
      "growth/stack",
      "growth/w",
    ])("opens for an error at /components/0/%s", (field) => {
      render(
        <ValidationContext.Provider value={[err("field.test", `/components/0/${field}`, "Bad.")]}>
          <Editor component={of(kind)} index={0} onChange={vi.fn()} />
        </ValidationContext.Provider>,
      );
      expect(more().getAttribute("aria-expanded")).toBe("true");
    });

    it("stays closed for an error at another component", () => {
      render(
        <ValidationContext.Provider
          value={[err("field.test", "/components/10/separators", "Bad.")]}
        >
          <Editor component={of(kind)} index={0} onChange={vi.fn()} />
        </ValidationContext.Provider>,
      );
      expect(more().getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("leaves empty-list errors to the status heading, which lists them (errorsWithoutField)", () => {
    render(
      <ValidationContext.Provider
        value={[
          err("field.empty", "/components/0/items", "Add at least one item."),
          err("field.empty", "/components/1/figures", "Add at least one figure."),
        ]}
      >
        <BulkEditor component={{ ...of("bulk"), items: [] }} index={0} onChange={vi.fn()} />
        <MinisEditor
          component={{ ...of("minis"), id: "x2", figures: [] }}
          index={1}
          onChange={vi.fn()}
        />
      </ValidationContext.Provider>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).not.toContain("Add at least one");
  });

  it("moves focus into the shape chips when a file-set curved floor on tiles is turned off", () => {
    function Harness() {
      const [c, setC] = useState<TilesComponent>({ ...of("tiles"), curvedFloor: true });
      return <TilesEditor component={c} index={0} onChange={setC} />;
    }
    render(<Harness />);
    openMore();
    const floor = screen.getByRole("button", { name: "Curved floor" });
    floor.focus();
    fireEvent.click(floor);
    expect(screen.queryByRole("button", { name: "Curved floor" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Finger cuts" }));
  });
});
