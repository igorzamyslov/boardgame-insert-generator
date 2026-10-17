// src/ui/components/CardsEditor.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { CardsComponent } from "../../model/types";
import { ValidationContext } from "../validation";
import { CardsEditor, cardPresetOf } from "./CardsEditor";
import { choose, openMore, openRows, pressedIn } from "./test-editors";

afterEach(cleanup);

function cards(over: Partial<CardsComponent> = {}): CardsComponent {
  const c = newComponent("cards");
  if (c.kind !== "cards") {
    throw new Error("expected cards");
  }
  return { ...c, id: "c1", ...over };
}

function setup(c: CardsComponent) {
  const onChange = vi.fn<(next: CardsComponent) => void>();
  const view = render(<CardsEditor component={c} index={0} onChange={onChange} />);
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
  it("picks a size preset from the chips", () => {
    expect(cardPresetOf(cards())).toBe("standard");
    const { last } = setup(cards());
    expect(pressedIn("Card size")).toBe("Standard");
    choose("Card size", "Tarot");
    expect(last()).toMatchObject({ shortSide: 70, longSide: 120 });
  });

  it("says the card's size under the chips", () => {
    setup(cards());
    expect(screen.getByText("63.5 × 88 mm")).toBeTruthy();
  });

  it("offers the common sizes, and the one a file set when it is not among them", () => {
    setup(cards({ shortSide: 80, longSide: 120 }));
    const labels = Array.from(
      screen.getByRole("group", { name: "Card size" }).querySelectorAll("button"),
    ).map((b) => b.textContent);
    expect(labels).toEqual([
      "Standard",
      "Standard American",
      "Euro",
      "Mini Euro",
      "Tarot",
      "Dixit",
      "My own size",
    ]);
    expect(pressedIn("Card size")).toBe("Dixit");
  });

  it("commits custom sides on blur and orders them short ≤ long", () => {
    const { onChange, last } = setup(cards());
    choose("Card size", "My own size");
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

  describe("decks", () => {
    it("counts one deck with the stepper under the question, as Edit does", () => {
      const { last } = setup(cards());
      expect(screen.getByText("How many cards?")).toBeTruthy();
      fireEvent.input(screen.getByLabelText("Number of cards"), { target: { value: "52" } });
      expect(last().decks).toEqual([{ name: "", count: 52 }]);
      fireEvent.click(screen.getByRole("button", { name: "More" }));
      expect(last().decks[0]).toMatchObject({ count: 51 });
    });

    it("keeps the way to a second deck under More options, not among the basics", () => {
      const { last } = setup(cards());
      expect(screen.queryByRole("button", { name: "+ Another deck" })).toBeNull();
      openRows();
      fireEvent.click(screen.getByRole("button", { name: "+ Another deck" }));
      expect(last().decks).toHaveLength(2);
    });

    it("shows several decks as cards with a name, a count and a ×, and removes one", () => {
      const two = cards({
        decks: [
          { name: "A", count: 10 },
          { name: "B", count: 20 },
        ],
      });
      const { last } = setup(two);
      expect(screen.queryByLabelText("Number of cards")).toBeNull();
      fireEvent.input(screen.getByLabelText("How many in deck 2"), { target: { value: "25" } });
      expect(last().decks).toEqual([
        { name: "A", count: 10 },
        { name: "B", count: 25 },
      ]);
      fireEvent.click(screen.getByRole("button", { name: "Remove deck A" }));
      expect(last().decks).toEqual([{ name: "B", count: 20 }]);
      fireEvent.click(screen.getByRole("button", { name: "+ Another deck" }));
      expect(last().decks).toHaveLength(3);
    });
  });

  describe("sleeves", () => {
    it("picks none, standard or premium from the segments", () => {
      const { last } = setup(cards());
      expect(pressedIn("Sleeves")).toBe("None");
      choose("Sleeves", "Premium");
      expect(last().sleeve).toBe("premium");
    });

    it("sets a sleeve size of its own from the exact values, starting from what the sleeves add", () => {
      const { last, view, onChange } = setup(cards({ sleeve: "standard" }));
      openRows();
      expect((screen.getByLabelText(/Sleeve outer width/) as HTMLInputElement).value).toBe("66.5");
      fireEvent.input(screen.getByLabelText(/Added thickness per card/), {
        target: { value: "0,2" },
      });
      expect(last().sleeve).toEqual({ w: 66.5, h: 91, thickness: 0.2 });
      view.rerender(
        <CardsEditor
          component={cards({ sleeve: { w: 66.5, h: 91, thickness: 0.2 } })}
          index={0}
          onChange={onChange}
        />,
      );
      // a sleeve of its own has a segment of its own, pressed
      expect(pressedIn("Sleeves")).toBe("Custom");
    });
  });

  describe("More options", () => {
    it("offers how often, how the cards stand and the tray shape", () => {
      const { last } = setup(cards());
      expect(screen.queryByRole("group", { name: "Cards stand" })).toBeNull();
      openMore();
      expect(pressedIn("How often you reach for it")).toBe("Sometimes");
      expect(pressedIn("Cards stand")).toBe("Auto");
      choose("Cards stand", "Flat");
      expect(last().storage).toBe("flat");
      choose("Cards stand", "Short edge");
      expect(last().storage).toBe("upright-short");
      choose("How often you reach for it", "Only at setup");
      expect(last().access).toBe("setup");
    });

    it("measures a stack of cards instead of correcting the estimate", () => {
      const { last, view, onChange } = setup(cards());
      openRows();
      fireEvent.click(screen.getByLabelText(/Measure a stack/));
      expect(last().thickness).toEqual({ mode: "measured", cards: 50, stackMm: 20 });
      view.rerender(
        <CardsEditor
          component={cards({ thickness: { mode: "measured", cards: 50, stackMm: 20 } })}
          index={0}
          onChange={onChange}
        />,
      );
      expect(screen.queryByLabelText(/Correct the estimated thickness/)).toBeNull();
      fireEvent.input(screen.getByLabelText(/Height of that stack/), { target: { value: "22" } });
      expect(last().thickness).toEqual({ mode: "measured", cards: 50, stackMm: 22 });
    });

    it("counts per player, and says why a grouped one can't", () => {
      const { last, view, onChange } = setup(cards());
      openRows();
      fireEvent.click(screen.getByLabelText(/per player/));
      expect(last().perPlayer).toEqual({ players: 4 });
      view.rerender(
        <CardsEditor component={cards({ groupId: "g" })} index={0} onChange={onChange} />,
      );
      // the box stays focusable, says why, and does nothing
      const perPlayer = screen.getByLabelText(/per player/) as HTMLInputElement;
      expect(perPlayer.disabled).toBe(false);
      expect(perPlayer.getAttribute("aria-disabled")).toBe("true");
      expect(
        document.getElementById(perPlayer.getAttribute("aria-describedby") ?? "")?.textContent,
      ).toContain("Not available for grouped items.");
      onChange.mockClear();
      fireEvent.click(perPlayer);
      expect(onChange).not.toHaveBeenCalled();
      expect(perPlayer.checked).toBe(false);
      const group = screen.getByLabelText(/^Group/);
      fireEvent.input(group, { target: { value: "" } });
      fireEvent.blur(group);
      expect("groupId" in last()).toBe(false);
    });

    it("gives the component its own extra room", () => {
      const { last } = setup(cards());
      openRows();
      fireEvent.click(screen.getByLabelText("Use its own extra room"));
      expect(last().clearance).toBe(1);
    });

    it("trims the group name on blur without committing an unchanged value", () => {
      const onChange = vi.fn();
      render(<CardsEditor component={cards({ groupId: "g" })} index={0} onChange={onChange} />);
      openRows();
      const group = screen.getByLabelText(/^Group/) as HTMLInputElement;
      fireEvent.input(group, { target: { value: "g " } });
      fireEvent.blur(group);
      expect(group.value).toBe("g");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("shows finger cuts on, no curved floor, and corner holes off", () => {
      const { last } = setup(cards());
      openMore();
      const cuts = screen.getByRole("button", { name: "Finger cuts" });
      expect(cuts.getAttribute("aria-pressed")).toBe("true");
      expect(screen.queryByRole("button", { name: "Curved floor" })).toBeNull();
      const holes = screen.getByRole("button", { name: "Corner holes" });
      expect(holes.getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(cuts);
      expect(last().fingerCuts).toBe(false);
      fireEvent.click(holes);
      expect(last().cornerReliefs).toBe(true);
    });

    it("shows a curved floor a file set on cards, so it can be turned off", () => {
      const { last } = setup(cards({ curvedFloor: true }));
      openMore();
      const floor = screen.getByRole("button", { name: "Curved floor" });
      expect(floor.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(floor);
      expect(last().curvedFloor).toBe(false);
    });
  });

  describe("room to grow (minimal-trays spec §5)", () => {
    it("offers one choice, along the stack, set to auto by default for a deck that stands up", () => {
      const { last } = setup(cards({ storage: "upright-long" }));
      openMore();
      expect(pressedIn("Room for expansions")).toBe("Auto");
      const labels = Array.from(
        screen.getByRole("group", { name: "Room for expansions" }).querySelectorAll("button"),
      ).map((b) => b.textContent);
      expect(labels).toEqual(["None", "Auto", "A set amount", "Max"]);
      choose("Room for expansions", "None");
      expect(last().growth).toEqual({ stack: "off" });
      expect("stretch" in last()).toBe(false);
    });

    it("never offers the card's own width or length, or a second axis", () => {
      setup(cards({ storage: "upright-long" }));
      openMore();
      expect(screen.queryByRole("group", { name: /Extra (width|length|height)/ })).toBeNull();
    });

    it("is none by default for a deck lying flat", () => {
      const { last } = setup(cards({ storage: "flat" }));
      openMore();
      expect(pressedIn("Room for expansions")).toBe("None");
      choose("Room for expansions", "Auto");
      expect(last().growth).toEqual({ stack: "auto" });
    });

    it("stores nothing when the choice is the default, and removes a stored one", () => {
      const { last } = setup(cards({ storage: "upright-long", growth: { stack: "max" } }));
      openMore();
      choose("Room for expansions", "Auto");
      expect("growth" in last()).toBe(false);
    });

    it("takes a number of mm, starting at 10, and keeps it as typed", () => {
      const { last, view } = setup(cards({ storage: "upright-long" }));
      openMore();
      choose("Room for expansions", "A set amount");
      expect(last().growth).toEqual({ stack: 10 });
      view.unmount();
      const next = setup(cards({ storage: "upright-long", growth: { stack: 10 } }));
      openMore();
      expect(pressedIn("Room for expansions")).toBe("A set amount");
      fireEvent.input(screen.getByLabelText(/Room for expansions, amount/), {
        target: { value: "7,5" },
      });
      expect(next.last().growth).toEqual({ stack: 7.5 });
    });
  });

  describe("the spacer plates and the dividers", () => {
    it("offers spacer plates only while the stack may grow", () => {
      const { view } = setup(cards({ growth: { stack: "off" } }));
      openRows();
      expect(screen.queryByLabelText("Spacer plates")).toBeNull();
      view.unmount();
      const { last } = setup(cards());
      openRows();
      const field = screen.getByLabelText("Spacer plates") as HTMLInputElement;
      expect(field.value).toBe("0");
      fireEvent.input(field, { target: { value: "3" } });
      expect(last().separators).toBe(3);
    });

    it("stores nothing when the count goes back to 0, and one block when it is 1", () => {
      const { last } = setup(cards({ separators: 3 }));
      openRows();
      fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "1" } });
      expect(last().separators).toBe(1);
      fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "0" } });
      expect("separators" in last()).toBe(false);
    });

    it("shows a stored count of spacer plates", () => {
      setup(cards({ separators: 4 }));
      openRows();
      expect((screen.getByLabelText("Spacer plates") as HTMLInputElement).value).toBe("4");
    });

    it("offers one removable divider as a chip, and a number of them in the exact values", () => {
      const { last } = setup(cards({ storage: "upright-long" }));
      openRows();
      const chip = screen.getByRole("button", { name: "Removable dividers" });
      expect(chip.getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(chip);
      expect(last().dividers).toBe(1);
      const field = screen.getByLabelText("Number of dividers") as HTMLInputElement;
      expect(field.value).toBe("0");
      fireEvent.input(field, { target: { value: "2" } });
      expect(last().dividers).toBe(2);
    });

    it("are offered to a deck of auto storage, which may stand", () => {
      setup(cards({ storage: "auto" }));
      openRows();
      expect(screen.queryByRole("button", { name: "Removable dividers" })).not.toBeNull();
    });

    it("are not offered to a flat deck, or to one that may not grow", () => {
      const { view } = setup(cards({ storage: "flat" }));
      openRows();
      expect(screen.queryByRole("button", { name: "Removable dividers" })).toBeNull();
      view.unmount();
      const { view: off } = setup(cards({ growth: { stack: "off" } }));
      openRows();
      expect(screen.queryByRole("button", { name: "Removable dividers" })).toBeNull();
      off.unmount();
    });

    it("stores nothing when the count goes back to 0", () => {
      const { last } = setup(cards({ storage: "upright-long", dividers: 3 }));
      openRows();
      fireEvent.input(screen.getByLabelText("Number of dividers"), { target: { value: "0" } });
      expect("dividers" in last()).toBe(false);
    });

    it("replace the spacer plates, which are not offered while the well has dividers", () => {
      setup(cards({ storage: "upright-long", dividers: 2, separators: 4 }));
      openRows();
      expect(screen.queryByLabelText("Spacer plates")).toBeNull();
    });

    it("are held to the bound", () => {
      const { onChange } = setup(cards({ storage: "upright-long" }));
      openRows();
      fireEvent.input(screen.getByLabelText("Number of dividers"), { target: { value: "99" } });
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});

describe("CardsEditor validation", () => {
  it("leaves the empty decks error to the status heading, which lists it", () => {
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
        <CardsEditor component={cards({ decks: [] })} index={0} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).not.toContain("Add at least one deck");
  });

  it("shows the engine's message for a count under the stepper", () => {
    render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.count",
            path: "/components/0/decks/0/count",
            message: "Bad count.",
          },
        ]}
      >
        <CardsEditor
          component={cards({ decks: [{ name: "x", count: -1 }] })}
          index={0}
          onChange={vi.fn()}
        />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Bad count.");
  });

  it("opens More options and the thickness row for a measured stack error", () => {
    render(
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
          onChange={vi.fn()}
        />
      </ValidationContext.Provider>,
    );
    expect(
      screen.getByRole("button", { name: /^More options/ }).getAttribute("aria-expanded"),
    ).toBe("true");
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
        <CardsEditor component={cards({ curvedFloor: true })} index={0} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Cards can't have a curved floor.");
  });
});

describe("the thickness correction", () => {
  it("shows the correction in the numbers", () => {
    setup(cards({ thickness: { mode: "preset", scale: 1.1 } }));
    openRows();
    expect(
      (screen.getByLabelText(/Correct the estimated thickness/) as HTMLInputElement).value,
    ).toBe("10");
  });

  it("commits a correction as a multiplier", () => {
    const { last } = setup(cards());
    openRows();
    fireEvent.input(screen.getByLabelText(/Correct the estimated thickness/), {
      target: { value: "-12.5" },
    });
    expect(last().thickness).toEqual({ mode: "preset", scale: 0.875 });
  });

  it("stores no correction at all for 0 %", () => {
    const { last } = setup(cards({ thickness: { mode: "preset", scale: 1.1 } }));
    openRows();
    fireEvent.input(screen.getByLabelText(/Correct the estimated thickness/), {
      target: { value: "0" },
    });
    expect(last().thickness).toEqual({ mode: "preset" });
  });

  it("says what the row is for, with the board's words, and nothing more", () => {
    setup(cards());
    openMore();
    const row = screen.getByRole("button", { name: /^Card thickness/ });
    expect(row.textContent).toContain(
      "From the sleeve table. Measure your stack if decks come out tight.",
    );
    expect(document.body.textContent).not.toMatch(/card stack clearance/);
  });
});
