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

  it("offers measure N cards, storage and common options under More options", () => {
    const { last, view, onChange } = setup(cards(), true);
    expect(screen.getByLabelText("Needed during play").closest("details.pf-disc")).not.toBeNull();
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

  it("folds the optional fields under More options, closed unless something inside has an error", () => {
    const { view } = setup(cards());
    const disc = view.container.querySelector("details.pf-disc") as HTMLDetailsElement;
    expect(disc.querySelector("summary")?.textContent).toBe("More options");
    expect(disc.open).toBe(false);
    for (const label of ["Finger cuts", "Storage", "Group", /Measure a stack/, /per player/]) {
      expect(disc.contains(screen.getByLabelText(label))).toBe(true);
    }
    expect(disc.contains(screen.getByLabelText("Name of deck 1"))).toBe(false);
  });

  it("shows finger cuts, no curved floor, and corner reliefs", () => {
    const { last } = setup(cards(), true);
    const cuts = screen.getByLabelText("Finger cuts") as HTMLInputElement;
    expect(cuts.closest("details.pf-disc")).not.toBeNull();
    expect(cuts.checked).toBe(true);
    expect(screen.queryByLabelText("Curved floor")).toBeNull();
    const reliefs = screen.getByLabelText("Corner reliefs") as HTMLInputElement;
    expect(reliefs.checked).toBe(false);
    fireEvent.click(cuts);
    expect(last().fingerCuts).toBe(false);
    fireEvent.click(reliefs);
    expect(last().cornerReliefs).toBe(true);
  });

  describe("room to grow (minimal-trays spec §5)", () => {
    const control = () => screen.getByLabelText("Room for more cards") as HTMLSelectElement;

    it("offers one control, along the stack, set to auto by default for an upright deck", () => {
      const { last } = setup(cards({ storage: "upright-long" }), true);
      expect(control().closest("details.pf-disc")).not.toBeNull();
      expect(control().value).toBe("auto");
      const labels = Array.from(control().options).map((o) => o.textContent);
      expect(labels).toEqual(["Off", "Auto (default)", "A set amount", "As much as there is"]);
      fireEvent.change(control(), { target: { value: "off" } });
      expect(last().growth).toEqual({ stack: "off" });
      expect("stretch" in last()).toBe(false);
    });

    it("never offers the card's own width or length, or a second axis", () => {
      setup(cards({ storage: "upright-long" }), true);
      expect(document.querySelectorAll("select[id*='-growth-']")).toHaveLength(1);
      expect(screen.queryByLabelText(/Extra (width|length|height)/)).toBeNull();
    });

    it("is off by default for a deck lying flat, and says so", () => {
      const { last } = setup(cards({ storage: "flat" }), true);
      expect(control().value).toBe("off");
      expect(Array.from(control().options).map((o) => o.textContent)).toContain("Off (default)");
      fireEvent.change(control(), { target: { value: "auto" } });
      expect(last().growth).toEqual({ stack: "auto" });
    });

    it("stores nothing when the choice is the default, and removes a stored one", () => {
      const { last } = setup(cards({ storage: "upright-long", growth: { stack: "max" } }), true);
      fireEvent.change(control(), { target: { value: "auto" } });
      expect("growth" in last()).toBe(false);
    });

    it("takes a number of mm, starting at 10, and keeps it as typed", () => {
      const { last, view } = setup(cards({ storage: "upright-long" }), true);
      fireEvent.change(control(), { target: { value: "amount" } });
      expect(last().growth).toEqual({ stack: 10 });
      view.unmount();
      const next = setup(cards({ storage: "upright-long", growth: { stack: 10 } }), true);
      expect(control().value).toBe("amount");
      fireEvent.input(screen.getByLabelText(/Room for more cards, amount/), {
        target: { value: "7,5" },
      });
      expect(next.last().growth).toEqual({ stack: 7.5 });
    });

    it("states what auto is and the retention limit in the hint", () => {
      setup(cards({ storage: "upright-long" }), true);
      const hint = document.getElementById(`${control().id}-hint`)?.textContent ?? "";
      expect(hint).toMatch(/Auto: up to the deck's thickness, at most 50 mm/);
      expect(hint).toMatch(/at most 1× its own thickness/);
      expect(hint).toMatch(/with plates, 6×; with dividers, 1× per section/);
    });
  });

  it("offers spacer plates only while the stack may grow, with a hint", () => {
    const { view } = setup(cards({ growth: { stack: "off" } }), true);
    expect(screen.queryByLabelText("Spacer plates")).toBeNull();
    view.unmount();
    const { last } = setup(cards(), true);
    const field = screen.getByLabelText("Spacer plates") as HTMLInputElement;
    expect(field.value).toBe("0");
    expect(document.getElementById(`${field.id}-hint`)?.textContent).toMatch(/pulled out/i);
    fireEvent.input(field, { target: { value: "3" } });
    expect(last().separators).toBe(3);
  });

  describe("dividers", () => {
    it("are offered to a deck that stands up and may grow, with a hint", () => {
      const { last } = setup(cards({ storage: "upright-long" }), true);
      const field = screen.getByLabelText("Dividers") as HTMLInputElement;
      expect(field.value).toBe("0");
      expect(document.getElementById(`${field.id}-hint`)?.textContent).toMatch(
        /slot in the tray's floor/,
      );
      fireEvent.input(field, { target: { value: "2" } });
      expect(last().dividers).toBe(2);
    });

    it("are offered to a deck of auto storage, which may stand", () => {
      setup(cards({ storage: "auto" }), true);
      expect(screen.queryByLabelText("Dividers")).not.toBeNull();
    });

    it("are not offered to a flat deck, or to one that may not grow", () => {
      const { view } = setup(cards({ storage: "flat" }), true);
      expect(screen.queryByLabelText("Dividers")).toBeNull();
      view.unmount();
      const { view: off } = setup(cards({ growth: { stack: "off" } }), true);
      expect(screen.queryByLabelText("Dividers")).toBeNull();
      off.unmount();
    });

    it("stores nothing when the count goes back to 0", () => {
      const { last } = setup(cards({ storage: "upright-long", dividers: 3 }), true);
      fireEvent.input(screen.getByLabelText("Dividers"), { target: { value: "0" } });
      expect("dividers" in last()).toBe(false);
    });

    it("replace the spacer plates, which are not offered while the well has dividers", () => {
      setup(cards({ storage: "upright-long", dividers: 2, separators: 4 }), true);
      expect(screen.queryByLabelText("Spacer plates")).toBeNull();
      expect(screen.getByText(/Spacer plates are off while the well has dividers/)).toBeTruthy();
    });

    it("are held to the bound", () => {
      const { onChange } = setup(cards({ storage: "upright-long" }), true);
      fireEvent.input(screen.getByLabelText("Dividers"), { target: { value: "99" } });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it("stores nothing when the count goes back to 0, and one block when it is 1", () => {
    const { last } = setup(cards({ separators: 3 }), true);
    fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "1" } });
    expect(last().separators).toBe(1);
    fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "0" } });
    expect("separators" in last()).toBe(false);
  });

  it("shows a stored count of spacer plates", () => {
    setup(cards({ separators: 4 }), true);
    expect((screen.getByLabelText("Spacer plates") as HTMLInputElement).value).toBe("4");
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

  it("opens More options for a measured stack error", () => {
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
    expect((container.querySelector("details.pf-disc") as HTMLDetailsElement).open).toBe(true);
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

describe("derived sizes and the thickness correction", () => {
  it("shows what the presets add up to, beside the editor, even in simple mode", () => {
    setup(cards({ name: "Starter", decks: [{ name: "Deck 1", count: 50 }] }));
    expect(
      screen.getByText(
        "Starter — Deck 1: 50 cards ≈ 16 mm thick (0.32 mm per card), in a 65 × 89.5 mm well.",
      ),
    ).toBeTruthy();
  });

  it("shows the correction in the numbers", () => {
    setup(
      cards({
        decks: [{ name: "Deck 1", count: 100 }],
        thickness: { mode: "preset", scale: 1.1 },
      }),
      true,
    );
    expect(screen.getByText(/100 cards ≈ 35.2 mm thick/)).toBeTruthy();
    expect(
      (screen.getByLabelText(/Correct the estimated thickness/) as HTMLInputElement).value,
    ).toBe("10");
  });

  it("commits a correction as a multiplier", () => {
    const { last } = setup(cards(), true);
    fireEvent.input(screen.getByLabelText(/Correct the estimated thickness/), {
      target: { value: "-12.5" },
    });
    expect(last().thickness).toEqual({ mode: "preset", scale: 0.875 });
  });

  it("stores no correction at all for 0 %", () => {
    const { last } = setup(cards({ thickness: { mode: "preset", scale: 1.1 } }), true);
    fireEvent.input(screen.getByLabelText(/Correct the estimated thickness/), {
      target: { value: "0" },
    });
    expect(last().thickness).toEqual({ mode: "preset" });
  });

  it("says how it differs from Fit and the stack clearance, and what to do instead", () => {
    setup(cards(), true);
    const hint = screen.getByText(/corrects the estimate itself/);
    expect(hint.textContent).toMatch(/Fit/);
    expect(hint.textContent).toMatch(/card stack clearance/);
  });

  it("hides the correction while a measured stack stands in for it", () => {
    setup(cards({ thickness: { mode: "measured", cards: 50, stackMm: 20 } }), true);
    expect(screen.queryByLabelText(/Correct the estimated thickness/)).toBeNull();
    expect(screen.getByText(/50 cards ≈ 20 mm thick \(0.4 mm per card\)/)).toBeTruthy();
  });
});
