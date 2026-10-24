// src/ui/BoxPanel.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOX } from "../model/defaults";
import { BoxPanel } from "./BoxPanel";
import type { BoxPanelProps } from "./BoxPanel";
import { ValidationContext } from "./validation";

afterEach(cleanup);

function props(over: Partial<BoxPanelProps> = {}): BoxPanelProps {
  return { box: DEFAULT_BOX, onChange: vi.fn(), onBack: vi.fn(), ...over };
}

describe("BoxPanel", () => {
  it("labels the size fields and commits decimal-comma input", () => {
    const onChange = vi.fn();
    render(<BoxPanel {...props({ onChange })} />);
    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "290,5" } });
    expect(onChange).toHaveBeenCalledWith({ innerWidth: 290.5 });
    expect(screen.getByLabelText(/^Length/)).toBeTruthy();
    // front to back is "length", not "depth", which reads as vertical
    expect(screen.queryByLabelText(/^Depth/)).toBeNull();
    expect(screen.getByLabelText(/^Height/)).toBeTruthy();
    expect(screen.getByText("Inside size")).toBeTruthy();
  });

  it("keeps the unit out of the rail's size fields, says it once above them, and in each name", () => {
    const { container } = render(<BoxPanel {...props()} />);
    const sizes = container.querySelector(".bx-sizes") as HTMLElement;
    // no "mm" drawn inside the three boxes: "285.5" needs the room
    expect(sizes.querySelectorAll(".k-field__unit")).toHaveLength(0);
    expect(within(sizes).queryByText("mm")).toBeNull();
    expect(screen.getByText("In mm")).toBeTruthy();
    for (const name of ["Width", "Length", "Height"]) {
      expect(
        screen.getByRole("textbox", { name: new RegExp(`^${name}\\s*\\(mm\\)$`) }),
      ).toBeTruthy();
    }
    // the space on top keeps its "mm": its field is the same line as the segment, with no line over it
    expect(screen.getByRole("textbox", { name: /^Space on top\s*\(mm\)$/ })).toBeTruthy();
    expect(container.querySelectorAll(".k-field__unit")).toHaveLength(1);
  });

  it("drops the hint lines the board does not draw (fate row 32)", () => {
    render(<BoxPanel {...props({ box: { ...DEFAULT_BOX, headroom: 8 } })} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/narrowest point/);
    expect(text).not.toMatch(/length front to back/);
    expect(text).not.toMatch(/plus 1 mm for warp/);
    expect(text).not.toMatch(/Loose pieces stay out of top trays/);
    // the board's own lines stay
    expect(screen.getByText("For the rulebook, boards or player mats")).toBeTruthy();
    // the line under the choice is true of the choice (ruled 2026-10-24: the board's was not)
    expect(screen.getByText("Trays stop 8 mm below the lid, everywhere.")).toBeTruthy();
    expect(screen.queryByText(/only where the rulebook lies/)).toBeNull();
  });

  describe("Part of it asks for what lies there", () => {
    const partial = (over: Partial<typeof DEFAULT_BOX> = {}) => ({
      ...DEFAULT_BOX,
      headroom: 14,
      headroomCoverage: "partial" as const,
      ...over,
    });

    it("shows no size fields for Whole top or for 0 mm", () => {
      render(<BoxPanel {...props({ box: { ...DEFAULT_BOX, headroom: 8 } })} />);
      expect(screen.queryByText("What lies there")).toBeNull();
      cleanup();
      render(<BoxPanel {...props({ box: partial({ headroom: 0 }) })} />);
      expect(screen.queryByText("What lies there")).toBeNull();
      expect(document.querySelector(".bx-top__line")).toBeNull();
    });

    it("says, with no size yet, that the whole top is reserved until there is one", () => {
      render(<BoxPanel {...props({ box: partial() })} />);
      expect(screen.getByText("What lies there")).toBeTruthy();
      expect(
        screen.getByText(
          "Give its width and length to reserve only that much. Until then the whole top is reserved.",
        ),
      ).toBeTruthy();
    });

    it("commits width and length into the first area, keeping the other side", () => {
      const onChange = vi.fn();
      const box = partial({
        headroomAreas: [
          { name: "Mats", w: 280, d: 100 },
          { w: 5, d: 5 },
        ],
      });
      render(<BoxPanel {...props({ box, onChange })} />);
      fireEvent.input(screen.getByRole("textbox", { name: /^Width.*of what lies there/ }), {
        target: { value: "300" },
      });
      expect(onChange).toHaveBeenLastCalledWith({
        headroomAreas: [
          { name: "Mats", w: 300, d: 100 },
          { w: 5, d: 5 },
        ],
      });
      fireEvent.input(screen.getByRole("textbox", { name: /^Length.*of what lies there/ }), {
        target: { value: "90" },
      });
      expect(onChange).toHaveBeenLastCalledWith({
        headroomAreas: [
          { name: "Mats", w: 280, d: 90 },
          { w: 5, d: 5 },
        ],
      });
    });

    it("starts the list from nothing when there is none", () => {
      const onChange = vi.fn();
      render(<BoxPanel {...props({ box: partial(), onChange })} />);
      fireEvent.input(screen.getByRole("textbox", { name: /^Width.*of what lies there/ }), {
        target: { value: "220" },
      });
      expect(onChange).toHaveBeenLastCalledWith({ headroomAreas: [{ w: 220, d: 0 }] });
    });

    it("says where the sized area goes and that trays reach the lid elsewhere", () => {
      render(<BoxPanel {...props({ box: partial({ headroomAreas: [{ w: 220, d: 290 }] }) })} />);
      expect(
        screen.getByText(
          "Reserved: 220 × 290 mm, in a corner the plan picks. Trays reach the lid everywhere else.",
        ),
      ).toBeTruthy();
    });

    it("keeps the unit in the phone's fields and drops the line above them", () => {
      const { container } = render(<BoxPanel {...props({ box: partial(), phone: true })} />);
      expect(container.querySelectorAll(".bx-area .k-field__unit")).toHaveLength(2);
      expect(screen.queryByText("In mm")).toBeNull();
    });

    it("shows the engine's message when the area is larger than the floor", () => {
      const message = "The space kept on top is larger than the floor of the box.";
      render(
        <ValidationContext.Provider
          value={[{ level: "error", code: "field.topArea", path: "/box/headroomAreas/0", message }]}
        >
          <BoxPanel {...props({ box: partial({ headroomAreas: [{ w: 999, d: 5 }] }) })} />
        </ValidationContext.Provider>,
      );
      expect(screen.getByText(message)).toBeTruthy();
    });
  });

  it("box headroom is always visible", () => {
    const view = render(<BoxPanel {...props({ box: { ...DEFAULT_BOX, headroom: 0 } })} />);
    for (const box of [
      { ...DEFAULT_BOX, headroom: 0 },
      { ...DEFAULT_BOX, headroom: 8 },
    ]) {
      view.rerender(<BoxPanel {...props({ box })} />);
      expect(screen.getByLabelText(/^Space on top/)).toBeTruthy();
      expect(screen.getByText("Keep space free on top")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Whole top" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Part of it" })).toBeTruthy();
      expect(screen.getByLabelText(/stored on its side/)).toBeTruthy();
    }
    // the old names are gone
    expect(screen.queryByLabelText(/^Headroom/)).toBeNull();
    expect(screen.queryByLabelText("Covered by boards")).toBeNull();
    expect(screen.queryByText("Covers")).toBeNull();
  });

  it("commits the space kept free on top, in mm", () => {
    const onChange = vi.fn();
    render(<BoxPanel {...props({ box: { ...DEFAULT_BOX, headroom: 8 }, onChange })} />);
    fireEvent.input(screen.getByLabelText(/^Space on top/), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({ headroom: 5 });
  });

  it("switches between Whole top and Part of it with pressed buttons", () => {
    const onChange = vi.fn();
    const base = { ...DEFAULT_BOX, headroom: 8 };
    const view = render(<BoxPanel {...props({ box: base, onChange })} />);
    const group = screen.getByRole("group", { name: "How much of the top" });
    const state = (name: string): string | null =>
      within(group).getByRole("button", { name }).getAttribute("aria-pressed");
    expect([state("Whole top"), state("Part of it")]).toEqual(["true", "false"]);
    fireEvent.click(screen.getByRole("button", { name: "Part of it" }));
    expect(onChange).toHaveBeenCalledWith({ headroomCoverage: "partial" });
    view.rerender(
      <BoxPanel {...props({ box: { ...base, headroomCoverage: "partial" }, onChange })} />,
    );
    expect([state("Whole top"), state("Part of it")]).toEqual(["false", "true"]);
    fireEvent.click(screen.getByRole("button", { name: "Whole top" }));
    expect(onChange).toHaveBeenCalledWith({ headroomCoverage: "full" });
  });

  it("mutes Whole top and Part of it at 0 mm with its reason, still visible and focusable", () => {
    const onChange = vi.fn();
    const view = render(
      <BoxPanel {...props({ box: { ...DEFAULT_BOX, headroom: 0 }, onChange })} />,
    );
    expect(screen.getByRole("group", { name: "How much of the top" })).toBeTruthy();
    for (const name of ["Whole top", "Part of it"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.disabled).toBe(false);
      // it says why: a sentence the button points at
      const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toBe("Nothing is kept free on top yet.");
      button.focus();
      expect(document.activeElement).toBe(button);
    }
    fireEvent.click(screen.getByRole("button", { name: "Part of it" }));
    expect(onChange).not.toHaveBeenCalled();
    view.rerender(<BoxPanel {...props({ box: { ...DEFAULT_BOX, headroom: 8 }, onChange })} />);
    expect(screen.getByRole("button", { name: "Part of it" }).hasAttribute("aria-disabled")).toBe(
      false,
    );
  });

  it("toggles stored-on-side", () => {
    const onChange = vi.fn();
    render(<BoxPanel {...props({ onChange })} />);
    fireEvent.click(screen.getByLabelText(/stored on its side/));
    expect(onChange).toHaveBeenCalledWith({ storedOnSide: true });
  });

  it("explains stored on its side honestly", () => {
    render(<BoxPanel {...props()} />);
    // what the engine does: loose pieces go under other trays where they can
    const hint = screen.getByText(
      "Loose pieces go under other trays where they can, so nothing spills.",
    );
    const box = screen.getByLabelText(/stored on its side/);
    expect(document.getElementById(box.getAttribute("aria-describedby") ?? "")).toBe(hint);
    // the board's promise is not the engine's: the trays do not fill up to the lid
    expect(document.body.textContent).not.toMatch(/up to the lid/);
    expect(document.body.textContent).not.toMatch(/falls out/);
  });

  it("keeps every field's error in sight, outside any fold, and says no bits", () => {
    render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.length",
            path: "/box/headroom",
            message: "Use 0 mm or more.",
          },
          { level: "error", code: "field.length", path: "/box/innerHeight", message: "Use 70 mm." },
        ]}
      >
        <BoxPanel {...props()} />
      </ValidationContext.Provider>,
    );
    expect(screen.getByText("Use 0 mm or more.")).toBeTruthy();
    expect(screen.getByText("Use 70 mm.")).toBeTruthy();
    expect(document.querySelector("details")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bbits?\b/i);
  });

  it("names the panel in an h2 that takes the focus, and returns with the back link or Done", () => {
    const onBack = vi.fn();
    render(<BoxPanel {...props({ onBack })} />);
    const heading = screen.getByRole("heading", { level: 2, name: "The box" });
    // the page's h1 is the stage's side view
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(document.activeElement).toBe(heading);
    fireEvent.click(screen.getByRole("button", { name: "What's inside" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  describe("on a phone", () => {
    it("is MobileBox's sheet: Back, the h1, Done, and the side view under the fields", () => {
      const onBack = vi.fn();
      render(
        <BoxPanel
          {...props({ onBack, phone: true, sideView: <p data-testid="side">the drawing</p> })}
        />,
      );
      const h1 = screen.getByRole("heading", { level: 1, name: "The box" });
      expect(document.activeElement).toBe(h1);
      expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onBack).toHaveBeenCalledTimes(2);
      // the same fields, and the label of the drawing before it
      expect(screen.getByLabelText(/^Width/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Whole top" })).toBeTruthy();
      expect(screen.getByLabelText(/stored on its side/)).toBeTruthy();
      const side = screen.getByTestId("side");
      expect(screen.getByText("Side view of the box").localName).toBe("span");
      expect(
        screen.getByLabelText(/stored on its side/).compareDocumentPosition(side) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // MobileBox's fields keep their "mm", and it has no line "In mm"
      expect(document.querySelectorAll(".bx-sizes .k-field__unit")).toHaveLength(3);
      expect(screen.queryByText("In mm")).toBeNull();
      // MobileBox has no sentence under "Keep space free on top"
      expect(screen.queryByText("For the rulebook, boards or player mats")).toBeNull();
    });

    it("shows a notice (a failed run, say) first, in the scroll", () => {
      render(
        <BoxPanel
          {...props({ phone: true, notice: <p role="alert">The plan couldn't be updated</p> })}
        />,
      );
      expect(screen.getByRole("alert").textContent).toBe("The plan couldn't be updated");
    });
  });
});
