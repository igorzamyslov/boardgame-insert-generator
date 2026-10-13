// src/ui/components/CardsEditor.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { CardsComponent } from "../../model/types";
import { ValidationContext } from "../validation";
import { CardsEditor, cardPresetOf } from "./CardsEditor";

afterEach(cleanup);

function cards(over: Partial<CardsComponent> = {}): CardsComponent {
  const c = newComponent("cards");
  if (c.kind !== "cards") {
    throw new Error("expected cards");
  }
  return { ...c, id: "c1", ...over };
}

function setup(c: CardsComponent, advanced = false) {
  const onChange = vi.fn<(next: CardsComponent) => void>();
  const view = render(
    <CardsEditor component={c} index={0} advanced={advanced} onChange={onChange} />,
  );
  const last = (): CardsComponent => {
    const call = onChange.mock.calls.at(-1);
    if (!call) {
      throw new Error("onChange not called");
    }
    return call[0];
  };
  return { onChange, last, view };
}

describe("CardsEditor", () => {
  it("picks a size preset", () => {
    expect(cardPresetOf(cards())).toBe("standard");
    const { last } = setup(cards());
    fireEvent.change(screen.getByLabelText("Card size"), { target: { value: "tarot" } });
    expect(last()).toMatchObject({ shortSide: 70, longSide: 120 });
  });

  it("commits custom sides on blur and orders them short ≤ long", () => {
    const { onChange, last } = setup(cards());
    fireEvent.change(screen.getByLabelText("Card size"), { target: { value: "custom" } });
    const long = screen.getByLabelText(/Long side/);
    fireEvent.input(long, { target: { value: "1" } });
    fireEvent.input(long, { target: { value: "10" } });
    fireEvent.input(long, { target: { value: "100" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(long);
    expect(last()).toMatchObject({ shortSide: 63.5, longSide: 100 });
    const short = screen.getByLabelText(/Short side/);
    fireEvent.input(short, { target: { value: "120" } });
    fireEvent.blur(short);
    expect(last()).toMatchObject({ shortSide: 88, longSide: 120 });
  });

  it("edits, adds and removes decks", () => {
    const { last, view, onChange } = setup(cards());
    expect(screen.getByRole("button", { name: /Remove deck/ }).hasAttribute("disabled")).toBe(true);
    fireEvent.input(screen.getByLabelText("Cards in deck 1"), { target: { value: "52" } });
    expect(last().decks).toEqual([{ name: "", count: 52 }]);
    fireEvent.click(screen.getByRole("button", { name: "Add deck" }));
    expect(last().decks).toHaveLength(2);
    view.rerender(
      <CardsEditor
        component={cards({
          decks: [
            { name: "A", count: 10 },
            { name: "B", count: 20 },
          ],
        })}
        index={0}
        advanced={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove deck A" }));
    expect(last().decks).toEqual([{ name: "B", count: 20 }]);
  });

  it("switches to custom sleeves and edits their size", () => {
    const { last, view, onChange } = setup(cards());
    fireEvent.change(screen.getByLabelText("Sleeves"), { target: { value: "premium" } });
    expect(last().sleeve).toBe("premium");
    fireEvent.change(screen.getByLabelText("Sleeves"), { target: { value: "custom" } });
    expect(last().sleeve).toEqual({ w: 66.5, h: 91, thickness: 0.1 });
    view.rerender(
      <CardsEditor
        component={cards({ sleeve: { w: 66.5, h: 91, thickness: 0.1 } })}
        index={0}
        advanced={false}
        onChange={onChange}
      />,
    );
    fireEvent.input(screen.getByLabelText(/Added thickness per card/), {
      target: { value: "0,2" },
    });
    expect(last().sleeve).toEqual({ w: 66.5, h: 91, thickness: 0.2 });
  });

  it("offers measure N cards, storage and common options in the Advanced block", () => {
    const { last, view, onChange } = setup(cards(), true);
    expect(screen.getByLabelText("Needed during play").closest(".pf-adv")).not.toBeNull();
    fireEvent.click(screen.getByLabelText(/Measure a stack/));
    expect(last().thickness).toEqual({ mode: "measured", cards: 50, stackMm: 20 });
    fireEvent.change(screen.getByLabelText("Storage"), { target: { value: "flat" } });
    expect(last().storage).toBe("flat");
    fireEvent.click(screen.getByLabelText(/per player/));
    expect(last().perPlayer).toEqual({ players: 4 });
    view.rerender(
      <CardsEditor component={cards({ groupId: "g" })} index={0} advanced onChange={onChange} />,
    );
    expect(screen.getByLabelText(/per player/).hasAttribute("disabled")).toBe(true);
    const group = screen.getByLabelText(/^Group/);
    fireEvent.input(group, { target: { value: "" } });
    fireEvent.blur(group);
    expect("groupId" in last()).toBe(false);
  });

  it("hides the Advanced block in simple mode, with every field in it", () => {
    const { view } = setup(cards());
    expect(view.container.querySelector(".pf-adv")).toBeNull();
    for (const label of ["Finger cuts", "Storage", "Group", /Measure a stack/, /per player/]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("shows finger cuts, no curved floor, and corner reliefs in advanced mode", () => {
    const { last } = setup(cards(), true);
    const cuts = screen.getByLabelText("Finger cuts") as HTMLInputElement;
    expect(cuts.closest(".pf-adv")).not.toBeNull();
    expect(cuts.checked).toBe(true);
    expect(screen.queryByLabelText("Curved floor")).toBeNull();
    const reliefs = screen.getByLabelText("Corner reliefs") as HTMLInputElement;
    expect(reliefs.checked).toBe(false);
    fireEvent.click(cuts);
    expect(last().fingerCuts).toBe(false);
    fireEvent.click(reliefs);
    expect(last().cornerReliefs).toBe(true);
  });

  it("offers stretch to fill, off by default", () => {
    const { last } = setup(cards(), true);
    const stretch = screen.getByLabelText("Stretch to fill") as HTMLInputElement;
    expect(stretch.checked).toBe(false);
    fireEvent.click(stretch);
    expect(last().stretch).toBe(true);
  });

  it("shows a curved floor a file set on cards, so it can be turned off", () => {
    const { last } = setup(cards({ curvedFloor: true }), true);
    const floor = screen.getByLabelText("Curved floor") as HTMLInputElement;
    expect(floor.checked).toBe(true);
    fireEvent.click(floor);
    expect(last().curvedFloor).toBe(false);
  });
});

describe("CardsEditor validation", () => {
  it("shows the empty decks error under the Decks legend", () => {
    render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.empty",
            path: "/components/0/decks",
            message: "Add at least one deck.",
          },
        ]}
      >
        <CardsEditor
          component={cards({ decks: [] })}
          index={0}
          advanced={false}
          onChange={vi.fn()}
        />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Add at least one deck.");
  });

  it("shows the Advanced block for a measured stack error in simple mode", () => {
    const { container } = render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.length",
            path: "/components/0/thickness/stackMm",
            message: "Bad stack.",
          },
        ]}
      >
        <CardsEditor
          component={cards({ thickness: { mode: "measured", cards: 50, stackMm: 0 } })}
          index={0}
          advanced={false}
          onChange={vi.fn()}
        />
      </ValidationContext.Provider>,
    );
    expect(container.querySelector(".pf-adv")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Bad stack.");
  });

  it("shows a curved floor error in place on cards", () => {
    render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.curvedFloor",
            path: "/components/0/curvedFloor",
            message: "Cards can't have a curved floor.",
          },
        ]}
      >
        <CardsEditor
          component={cards({ curvedFloor: true })}
          index={0}
          advanced
          onChange={vi.fn()}
        />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Cards can't have a curved floor.");
  });

  it("trims the group name on blur without committing an unchanged value", () => {
    const onChange = vi.fn();
    render(
      <CardsEditor component={cards({ groupId: "g" })} index={0} advanced onChange={onChange} />,
    );
    const group = screen.getByLabelText(/^Group/) as HTMLInputElement;
    fireEvent.input(group, { target: { value: "g " } });
    fireEvent.blur(group);
    expect(group.value).toBe("g");
    expect(onChange).not.toHaveBeenCalled();
  });
});
