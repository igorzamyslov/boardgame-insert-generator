// src/ui/components/CardsEditor.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import { CARD_PRESETS } from "../../model/presets";
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

  it("offers the common sizes as chips, and the others inside My own size", () => {
    setup(cards());
    const labels = (name: string): (string | null)[] =>
      Array.from(screen.getByRole("group", { name }).querySelectorAll("button")).map(
        (b) => b.textContent,
      );
    expect(labels("Card size")).toEqual([
      "Standard",
      "Standard American",
      "Euro",
      "Mini Euro",
      "Tarot",
      "My own size",
    ]);
    expect(screen.queryByRole("group", { name: "Other sizes" })).toBeNull();
    choose("Card size", "My own size");
    expect(labels("Other sizes")).toEqual([
      "Mini American",
      "French Tarot",
      "Extra Large",
      "Dixit",
    ]);
  });

  it("opens My own size, with the other size pressed, for a file that set one", () => {
    setup(cards({ shortSide: 80, longSide: 120 }));
    expect(pressedIn("Card size")).toBe("My own size");
    expect(pressedIn("Other sizes")).toBe("Dixit");
  });

  it.each(CARD_PRESETS.map((p) => [p.id, p] as const))(
    "can select the %s preset",
    (_id, preset) => {
      const { last } = setup(cards({ shortSide: 10, longSide: 20 }));
      if (preset.common === true) {
        choose("Card size", preset.label);
      } else {
        choose("Other sizes", preset.label);
      }
      expect(last()).toMatchObject({ shortSide: preset.shortSide, longSide: preset.longSide });
    },
  );

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

    it("offers a second deck among the basics, under the stepper and before More options", () => {
      const { last } = setup(cards());
      const add = screen.getByRole("button", { name: "+ Another deck" });
      const stepper = screen.getByLabelText("Number of cards");
      const more = screen.getByRole("button", { name: /^More options/ });
      expect(stepper.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(add.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(more.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(add);
      expect(last().decks).toEqual([
        { name: "Deck 1", count: 50 },
        { name: "Deck 2", count: 50 },
      ]);
    });

    it("shows no name field for a lone deck without a name", () => {
      setup(cards());
      expect(screen.queryByLabelText("Deck name")).toBeNull();
    });

    it("keeps a lone deck's old name editable, under the stepper and before + Another deck", () => {
      const { last } = setup(cards({ decks: [{ name: "Deck 1", count: 15 }] }));
      const field = screen.getByLabelText("Deck name") as HTMLInputElement;
      expect(field.value).toBe("Deck 1");
      const stepper = screen.getByLabelText("Number of cards");
      const add = screen.getByRole("button", { name: "+ Another deck" });
      expect(
        stepper.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(field.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.input(field, { target: { value: "Base set" } });
      expect(last().decks).toEqual([{ name: "Base set", count: 15 }]);
    });

    it("keeps the name field while the name is emptied, and drops it on reopening", () => {
      const named = cards({ decks: [{ name: "Deck 1", count: 15 }] });
      const view = setup(named).view;
      fireEvent.input(screen.getByLabelText("Deck name"), { target: { value: "" } });
      view.rerender(
        <CardsEditor
          component={cards({ decks: [{ name: "", count: 15 }] })}
          index={0}
          onChange={vi.fn()}
        />,
      );
      expect((screen.getByLabelText("Deck name") as HTMLInputElement).value).toBe("");
      cleanup();
      setup(cards({ decks: [{ name: "", count: 15 }] }));
      expect(screen.queryByLabelText("Deck name")).toBeNull();
    });

    it("names a nameless lone deck Deck 1 when another is added", () => {
      const { last } = setup(cards({ decks: [{ name: "", count: 15 }] }));
      fireEvent.click(screen.getByRole("button", { name: "+ Another deck" }));
      expect(last().decks).toEqual([
        { name: "Deck 1", count: 15 },
        { name: "Deck 2", count: 50 },
      ]);
    });

    it("keeps a named lone deck's name when another is added", () => {
      const { last } = setup(cards({ decks: [{ name: "Base", count: 15 }] }));
      fireEvent.click(screen.getByRole("button", { name: "+ Another deck" }));
      expect(last().decks).toEqual([
        { name: "Base", count: 15 },
        { name: "Deck 2", count: 50 },
      ]);
    });

    it("clears the name of the deck a removal leaves alone, and offers no name field for it", () => {
      const two = cards({
        decks: [
          { name: "A", count: 10 },
          { name: "B", count: 20 },
        ],
      });
      const view = setup(two);
      fireEvent.click(screen.getByRole("button", { name: "Remove deck A" }));
      expect(view.last().decks).toEqual([{ name: "", count: 20 }]);
      view.view.rerender(
        <CardsEditor
          component={cards({ decks: view.last().decks })}
          index={0}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByLabelText("Number of cards")).toBeTruthy();
      expect(screen.queryByLabelText("Deck name")).toBeNull();
    });

    it("turns the stepper into the deck list in the same place, and back", () => {
      const slot = (view: ReturnType<typeof setup>["view"]): number =>
        Array.from(view.container.children).findIndex(
          (el) =>
            el.matches(".ed-cards") || el.querySelector('[aria-label="Number of cards"]') !== null,
        );
      const one = setup(cards());
      const place = slot(one.view);
      expect(place).toBeGreaterThanOrEqual(0);
      const grown = cards({
        decks: [
          { name: "", count: 50 },
          { name: "Deck 2", count: 50 },
        ],
      });
      one.view.rerender(<CardsEditor component={grown} index={0} onChange={one.onChange} />);
      expect(screen.queryByLabelText("Number of cards")).toBeNull();
      expect(slot(one.view)).toBe(place);
      // "+ Another deck" stays under the list
      const list = one.view.container.querySelector(".ed-cards");
      const add = screen.getByRole("button", { name: "+ Another deck" });
      expect(list?.compareDocumentPosition(add)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      one.view.rerender(<CardsEditor component={cards()} index={0} onChange={one.onChange} />);
      expect(screen.getByLabelText("Number of cards")).toBeTruthy();
      expect(slot(one.view)).toBe(place);
      expect(screen.getByRole("button", { name: "+ Another deck" })).toBeTruthy();
    });

    it("moves focus to the new deck's name", async () => {
      const onChange = vi.fn<(next: CardsComponent) => void>();
      const view = render(<CardsEditor component={cards()} index={0} onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", { name: "+ Another deck" }));
      const grown = cards({
        decks: [
          { name: "", count: 50 },
          { name: "Deck 2", count: 50 },
        ],
      });
      view.rerender(<CardsEditor component={grown} index={0} onChange={onChange} />);
      await waitFor(() => {
        expect(document.activeElement?.id).toBe("c1-deck1-name");
      });
    });

    it("has no Decks row under More options", () => {
      setup(cards());
      openRows();
      expect(screen.queryByRole("button", { name: /^Decks/ })).toBeNull();
      expect(screen.getAllByRole("button", { name: "+ Another deck" })).toHaveLength(1);
      expect(screen.queryByLabelText(/^Deck/)).toBeNull();
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
      fireEvent.input(screen.getByLabelText("Number of cards in deck 2"), {
        target: { value: "25" },
      });
      expect(last().decks).toEqual([
        { name: "A", count: 10 },
        { name: "B", count: 25 },
      ]);
      // each deck's count is a stepper, as the single deck's is
      const more = screen.getAllByRole("button", { name: "More" });
      expect(more).toHaveLength(2);
      fireEvent.click(more[0] as HTMLElement);
      expect(last().decks[0]).toEqual({ name: "A", count: 11 });
      fireEvent.click(screen.getByRole("button", { name: "Remove deck A" }));
      expect(last().decks).toEqual([{ name: "", count: 20 }]);
    });
  });

  describe("sleeves", () => {
    it("picks none, standard or premium from the segments", () => {
      const { last } = setup(cards());
      expect(pressedIn("Sleeves")).toBe("None");
      choose("Sleeves", "Premium");
      expect(last().sleeve).toBe("premium");
    });

    it("always offers Custom as the fourth segment", () => {
      setup(cards());
      const labels = Array.from(
        screen.getByRole("group", { name: "Sleeves" }).querySelectorAll("button"),
      ).map((b) => b.textContent);
      expect(labels).toEqual(["None", "Standard", "Premium", "Custom"]);
      expect(screen.queryByLabelText(/Sleeve outer width/)).toBeNull();
    });

    it("opens the sleeve-size fields on Custom, seeded with the sleeve's size now", async () => {
      const { last, view, onChange } = setup(cards({ sleeve: "standard" }));
      choose("Sleeves", "Custom");
      // 63.5 × 88 card, standard sleeve adds 3 mm and 0.1 mm per card
      expect(last().sleeve).toEqual({ w: 66.5, h: 91, thickness: 0.1 });
      view.rerender(
        <CardsEditor component={cards({ sleeve: last().sleeve })} index={0} onChange={onChange} />,
      );
      expect(pressedIn("Sleeves")).toBe("Custom");
      expect((screen.getByLabelText(/Sleeve outer width/) as HTMLInputElement).value).toBe("66.5");
      expect((screen.getByLabelText(/Sleeve outer length/) as HTMLInputElement).value).toBe("91");
      await waitFor(() => {
        expect(document.activeElement?.id).toBe("c1-sleeveW");
      });
    });

    it("seeds Custom from no sleeve with the card's own size, and goes back to a named sleeve", () => {
      const { last, view, onChange } = setup(cards());
      choose("Sleeves", "Custom");
      expect(last().sleeve).toEqual({ w: 63.5, h: 88, thickness: 0 });
      view.rerender(
        <CardsEditor component={cards({ sleeve: last().sleeve })} index={0} onChange={onChange} />,
      );
      choose("Sleeves", "Premium");
      expect(last().sleeve).toBe("premium");
    });

    it("sets a sleeve size of its own from the fields", () => {
      const { last } = setup(cards({ sleeve: { w: 66.5, h: 91, thickness: 0.1 } }));
      fireEvent.input(screen.getByLabelText(/Added thickness per card/), {
        target: { value: "0,2" },
      });
      expect(last().sleeve).toEqual({ w: 66.5, h: 91, thickness: 0.2 });
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

    it("has Copies: a stepper that sets the item's copies, and 1 is none", () => {
      const { last, view, onChange } = setup(cards());
      openRows();
      fireEvent.click(
        within(
          screen.getByRole("textbox", { name: "Copies" }).closest(".k-stepper-box") as HTMLElement,
        ).getByRole("button", { name: "More" }),
      );
      expect(last().copies).toBe(2);
      view.rerender(<CardsEditor component={cards({ copies: 4 })} index={0} onChange={onChange} />);
      fireEvent.input(screen.getByRole("textbox", { name: "Copies" }), { target: { value: "3" } });
      expect(last().copies).toBe(3);
      fireEvent.input(screen.getByRole("textbox", { name: "Copies" }), { target: { value: "1" } });
      expect("copies" in last()).toBe(false);
    });

    it("has no Group box: a group is made of items, not typed on one", () => {
      setup(cards());
      openRows();
      expect(screen.queryByLabelText(/^Group/)).toBeNull();
    });

    it("shows the insert's extra room, and a different number gives the component its own", () => {
      const { last } = setup(cards());
      openRows();
      // the insert's card clearance, 1.5 mm at Fit 1, is in the box: nothing is set
      const box = screen.getByLabelText(/^Room around the pieces/) as HTMLInputElement;
      expect(box.value).toBe("1.5");
      expect(
        screen.getByText("The insert's setting. Type another number to give this item its own."),
      ).toBeTruthy();
      fireEvent.input(box, { target: { value: "2" } });
      expect(last().clearance).toBe(2);
    });

    it("sets nothing when the number typed is the insert's own", () => {
      const { last } = setup(cards({ clearance: 2 }));
      openRows();
      fireEvent.input(screen.getByLabelText(/^Room around the pieces/), {
        target: { value: "1,5" },
      });
      expect("clearance" in last()).toBe(false);
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

    it("never offers a curved floor on cards, and gives a file that set one the way back instead of a chip", () => {
      const { view } = setup(cards());
      openMore();
      expect(screen.queryByRole("button", { name: /^Curved floor/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Back to curved floor/ })).toBeNull();
      view.unmount();
      const set = setup(cards({ curvedFloor: true }));
      openMore();
      // the chip is not offered, so it can't remove itself; the way back is the "Back to" link
      expect(screen.queryByRole("button", { name: /^Curved floor/ })).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Back to curved floor off for Tray shape" }),
      );
      expect("curvedFloor" in set.last()).toBe(false);
    });
  });

  describe("room for more cards", () => {
    it("is one row, None by default, for a deck of any stand", () => {
      for (const storage of ["upright-long", "flat", "auto"] as const) {
        const { view } = setup(cards({ storage }));
        openMore();
        expect(pressedIn("Room for more cards"), storage).toBe("None");
        const labels = Array.from(
          screen.getByRole("group", { name: "Room for more cards" }).querySelectorAll("button"),
        ).map((b) => b.textContent);
        expect(labels).toEqual(["None", "Some", "As much as fits"]);
        view.unmount();
      }
    });

    it("names the default only in the way back, and only while a room is set", () => {
      const { view } = setup(cards({ storage: "upright-long" }));
      openMore();
      expect(screen.queryByText(/is the default/)).toBeNull();
      expect(
        screen.queryByRole("button", { name: /^Back to .* for Room for more cards/ }),
      ).toBeNull();
      view.unmount();
      setup(cards({ storage: "upright-long", room: 20 }));
      openMore();
      expect(
        screen.getByRole("button", { name: "Back to None for Room for more cards" }),
      ).toBeTruthy();
    });

    it("never offers the card's own width or length, or a second axis", () => {
      setup(cards({ storage: "upright-long" }));
      openMore();
      expect(screen.queryByRole("group", { name: /Extra (width|length|height)/ })).toBeNull();
    });

    it("starts Some at 20 cards and keeps the number as typed", () => {
      const { last, view } = setup(cards({ storage: "upright-long" }));
      openMore();
      choose("Room for more cards", "Some");
      expect(last().room).toBe(20);
      view.unmount();
      const next = setup(cards({ storage: "upright-long", room: 20 }));
      openMore();
      expect(pressedIn("Room for more cards")).toBe("Some");
      fireEvent.input(screen.getByLabelText(/Room for more cards, amount/), {
        target: { value: "35" },
      });
      expect(next.last().room).toBe(35);
    });

    it("stores nothing for None", () => {
      const { last } = setup(cards({ storage: "upright-long", room: "max" }));
      openMore();
      choose("Room for more cards", "None");
      expect("room" in last()).toBe(false);
    });
  });

  describe("the spacer plates and the dividers", () => {
    it("offers spacer plates only while the stack may grow", () => {
      const { view } = setup(cards());
      openRows();
      expect(screen.queryByLabelText("Spacer plates")).toBeNull();
      view.unmount();
      const { last } = setup(cards({ room: 20 }));
      openRows();
      const field = screen.getByLabelText("Spacer plates") as HTMLInputElement;
      expect(field.value).toBe("0");
      fireEvent.input(field, { target: { value: "3" } });
      expect(last().separators).toBe(3);
    });

    it("stores nothing when the count goes back to 0, and one block when it is 1", () => {
      const { last } = setup(cards({ room: 20, separators: 3 }));
      openRows();
      fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "1" } });
      expect(last().separators).toBe(1);
      fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "0" } });
      expect("separators" in last()).toBe(false);
    });

    it("shows a stored count of spacer plates", () => {
      setup(cards({ room: 20, separators: 4 }));
      openRows();
      expect((screen.getByLabelText("Spacer plates") as HTMLInputElement).value).toBe("4");
    });

    it("offers one removable divider as a chip, and a number of them in the exact values", () => {
      const { last } = setup(cards({ room: 20, storage: "upright-long" }));
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
      setup(cards({ room: 20, storage: "auto" }));
      openRows();
      expect(screen.queryByRole("button", { name: "Removable dividers" })).not.toBeNull();
    });

    /** The reason a blocked control gives, as a reader is given it (aria-describedby). */
    const reasonOf = (el: HTMLElement): string =>
      document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent ?? "";

    it("blocks the dividers of a flat deck and says why, instead of dropping them", () => {
      const { onChange } = setup(cards({ room: 20, storage: "flat" }));
      openRows();
      const chip = screen.getByRole("button", { name: "Removable dividers" });
      expect(chip.getAttribute("aria-disabled")).toBe("true");
      expect(reasonOf(chip)).toBe("Flat decks have no dividers.");
      fireEvent.click(chip);
      // a press shows the reason where the chip is, for a touch that has no title
      expect(screen.getByRole("status").textContent).toBe("Flat decks have no dividers.");
      const row = screen.getByRole("button", { name: /^Dividers/ });
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.getAttribute("aria-expanded")).toBeNull();
      expect(row.textContent).toContain("Flat decks have no dividers.");
      fireEvent.click(row);
      expect(screen.queryByLabelText("Number of dividers")).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("points a flat deck's blocked dividers at Between decks when it has decks to put between", () => {
      const decks = [
        { name: "A", count: 20 },
        { name: "B", count: 20 },
      ];
      setup(cards({ room: 20, storage: "flat", decks }));
      openRows();
      const chip = within(screen.getByRole("group", { name: "Tray shape" })).getByRole("button", {
        name: "Removable dividers",
      });
      expect(chip.getAttribute("aria-disabled")).toBe("true");
      expect(reasonOf(chip)).toBe("For flat decks, see Between decks.");
      expect(screen.getByRole("button", { name: /^Dividers/ }).textContent).toContain(
        "For flat decks, see Between decks.",
      );
    });

    it("blocks the spacer plates and the dividers of a deck with no room to grow, with the reasons", () => {
      setup(cards());
      openRows();
      expect(screen.getByRole("button", { name: /^Spacer plates/ }).textContent).toContain(
        "Spacer plates need Room for more cards.",
      );
      const chip = screen.getByRole("button", { name: "Removable dividers" });
      expect(chip.getAttribute("aria-disabled")).toBe("true");
      expect(reasonOf(chip)).toBe("Dividers need Room for more cards.");
      expect(screen.getByRole("button", { name: /^Dividers/ }).textContent).toContain(
        "Dividers need Room for more cards.",
      );
    });

    it("blocks the spacer plates while the well has dividers", () => {
      setup(cards({ room: 20, storage: "upright-long", dividers: 2, separators: 4 }));
      openRows();
      const row = screen.getByRole("button", { name: /^Spacer plates/ });
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.textContent).toContain("Dividers take the place of spacer plates.");
      // the dividers themselves are on offer
      expect(
        screen.getByRole("button", { name: /^Dividers/ }).getAttribute("aria-disabled"),
      ).toBeNull();
    });

    it("blocks nothing where the deck can have both", () => {
      setup(cards({ room: 20, storage: "upright-long" }));
      openRows();
      for (const name of [/^Spacer plates/, /^Dividers/, /^Removable dividers$/]) {
        expect(screen.getByRole("button", { name }).getAttribute("aria-disabled")).toBeNull();
      }
    });

    it("stores nothing when the count goes back to 0", () => {
      const { last } = setup(cards({ room: 20, storage: "upright-long", dividers: 3 }));
      openRows();
      fireEvent.input(screen.getByLabelText("Number of dividers"), { target: { value: "0" } });
      expect("dividers" in last()).toBe(false);
    });

    it("are held to the bound", () => {
      const { onChange } = setup(cards({ room: 20, storage: "upright-long" }));
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
  describe("Between decks", () => {
    const two = [
      { name: "Starter", count: 20 },
      { name: "Market", count: 20 },
    ];
    const between = (): HTMLElement => screen.getByRole("button", { name: /^Between decks/ });

    /** The children of More options' panel, in order. */
    const panel = (): Element[] => {
      const more = screen.getByRole("button", { name: /^More options/ });
      return [
        ...(document.getElementById(more.getAttribute("aria-controls") ?? "")?.children ?? []),
      ];
    };
    const rowOf = (): Element => between().closest(".ed-exact") as Element;

    it("is a row directly under Cards stand once the item has two decks or more", () => {
      setup(cards({ decks: two }));
      openMore();
      const at = panel().indexOf(rowOf());
      expect(at).toBeGreaterThan(0);
      expect(
        panel()[at - 1]?.querySelector('[role="group"][aria-label="Cards stand"]'),
      ).not.toBeNull();
      expect(between().textContent).toContain("Fixed walls");
    });

    it("carries its value in a title, so a narrow rail that clips the meta still says it", () => {
      setup(cards({ decks: two, storage: "flat", flatDecks: "dividers" }));
      openMore();
      expect(between().querySelector(".k-drow__metatext")?.getAttribute("title")).toBe(
        "Removable dividers",
      );
    });

    it("is absent with one deck", () => {
      setup(cards());
      openMore();
      expect(screen.queryByRole("button", { name: /^Between decks/ })).toBeNull();
    });

    it("offers Fixed walls and Removable dividers, and writes flatDecks", () => {
      const { last } = setup(cards({ decks: two, storage: "flat" }));
      openRows();
      expect(pressedIn("Between decks")).toBe("Fixed walls");
      choose("Between decks", "Removable dividers");
      expect(last().flatDecks).toBe("dividers");
      choose("Between decks", "Fixed walls");
      // walls is the default: it is stored as nothing
      expect(last().flatDecks).toBeUndefined();
    });

    it("reads as set under Auto, and applies when Auto picks flat", () => {
      setup(cards({ decks: two, storage: "auto", flatDecks: "dividers" }));
      openMore();
      expect(between().getAttribute("aria-disabled")).toBeNull();
      expect(between().textContent).toContain("Removable dividers");
    });

    it("is blocked with upright storage, with its reason", () => {
      const { onChange } = setup(cards({ decks: two, storage: "upright-long" }));
      openMore();
      expect(between().getAttribute("aria-disabled")).toBe("true");
      expect(between().textContent).toContain("Only flat decks can share one well.");
      fireEvent.click(between());
      expect(screen.queryByRole("group", { name: "Between decks" })).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps its place when the storage changes", () => {
      const view = setup(cards({ decks: two, storage: "flat" }));
      openMore();
      const flat = panel().indexOf(rowOf());
      expect(flat).toBeGreaterThan(0);
      view.view.rerender(
        <CardsEditor
          component={cards({ decks: two, storage: "upright-short" })}
          index={0}
          onChange={view.onChange}
        />,
      );
      expect(panel().indexOf(rowOf())).toBe(flat);
    });
  });
});
