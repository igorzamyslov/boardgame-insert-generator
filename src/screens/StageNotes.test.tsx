// src/screens/StageNotes.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTICE_CODES } from "../layout";
import type { Notice } from "../model/types";
import { noteKey } from "../share";
import { LAYOUT_NOTICES_SHOWN, StageNotes } from "./StageNotes";

afterEach(cleanup);

const warnings = (n: number): Notice[] =>
  Array.from({ length: n }, (_, i) => ({
    level: "warning" as const,
    code: `w.${i}`,
    message: `Warning number ${i}`,
  }));

describe("StageNotes", () => {
  it("shows layout notices under the plan, three then Show all", () => {
    render(<StageNotes notices={warnings(5)} />);
    const list = screen.getByRole("list", { name: "Layout messages" });
    expect(LAYOUT_NOTICES_SHOWN).toBe(3);
    expect(list.querySelectorAll("li")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(list.querySelectorAll("li")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(list.querySelectorAll("li")).toHaveLength(3);
  });

  it("has no Show all when everything is shown", () => {
    render(<StageNotes notices={warnings(3)} />);
    expect(screen.queryByRole("button", { name: /^Show/ })).toBeNull();
  });

  it("never hides an error behind Show all", () => {
    const notices: Notice[] = [
      ...warnings(5),
      { level: "error", code: "e.1", message: "Too big for the bed." },
    ];
    render(<StageNotes notices={notices} />);
    const list = screen.getByRole("list", { name: "Layout messages" });
    expect(within(list).getByText("Too big for the bed.")).toBeTruthy();
  });

  it("draws a warning in the warn tone and a note in the info tone, each with its lead word", () => {
    const { container } = render(
      <StageNotes
        notices={[
          { level: "warning", code: "a", message: "Slack is high." },
          { level: "info", code: "b", message: "Spacers were cut." },
          { level: "error", code: "c", message: "Does not fit." },
        ]}
      />,
    );
    const boxes = [...container.querySelectorAll(".k-notice")];
    expect(boxes.map((b) => b.getAttribute("data-tone"))).toEqual(["warn", "info", "warn"]);
    expect(boxes.map((b) => b.querySelector("strong")?.textContent)).toEqual([
      "Warning:",
      "Note:",
      "Error:",
    ]);
  });

  it("keeps its live regions on the page when there is nothing to say", () => {
    const view = render(<StageNotes notices={[]} />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("list")).toBeNull();
    view.rerender(<StageNotes notices={warnings(2)} />);
    // warnings are read when the reader is idle
    expect(screen.getByRole("status").textContent).toBe("Warning number 0 Warning number 1");
  });

  it("reads an error out as an alert", () => {
    render(
      <StageNotes
        notices={[{ level: "error", code: NOTICE_CODES.doesNotFit, message: "It does not fit." }]}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("It does not fit.");
  });

  describe("hiding", () => {
    const note = (message: string): Notice => ({ level: "info", code: "n.1", message });
    const warn = (code: string): Notice => ({ level: "warning", code, message: `Warning ${code}` });

    it("closes a note and a warning, never an error", () => {
      render(
        <StageNotes
          notices={[note("A note."), warn("w"), { level: "error", code: "e", message: "Stuck." }]}
          onHide={() => undefined}
        />,
      );
      expect(screen.getAllByRole("button", { name: "Hide this note" })).toHaveLength(2);
    });

    it("hands the closed note to onHide", () => {
      const onHide = vi.fn();
      render(<StageNotes notices={[note("A note.")]} onHide={onHide} />);
      fireEvent.click(screen.getByRole("button", { name: "Hide this note" }));
      expect(onHide).toHaveBeenCalledWith(note("A note."));
    });

    it("leaves a hidden note out, counts it, and brings it back", () => {
      const onShowHidden = vi.fn();
      const hidden = { [noteKey(note("x"))]: "A note." };
      render(
        <StageNotes
          notices={[note("A note."), warn("w")]}
          hidden={hidden}
          onHide={() => undefined}
          onShowHidden={onShowHidden}
        />,
      );
      expect(screen.queryByText("A note.")).toBeNull();
      expect(
        within(screen.getByRole("list", { name: "Layout messages" })).getByText("Warning w"),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Show 1 hidden" }));
      expect(onShowHidden).toHaveBeenCalled();
    });

    it("shows a hidden note again when its words changed, and shows no link then", () => {
      const hidden = { [noteKey(note("x"))]: "Cut by 2 mm." };
      render(
        <StageNotes
          notices={[note("Cut by 3 mm.")]}
          hidden={hidden}
          onHide={() => undefined}
          onShowHidden={() => undefined}
        />,
      );
      expect(screen.getByText("Cut by 3 mm.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /hidden/ })).toBeNull();
    });

    it("moves focus to the next ×, then to the link when none is left", () => {
      function Host() {
        const [hidden, setHidden] = useState<Record<string, string>>({});
        return (
          <StageNotes
            notices={[warn("a"), warn("b")]}
            hidden={hidden}
            onHide={(n) => setHidden((h) => ({ ...h, [noteKey(n)]: n.message }))}
            onShowHidden={() => setHidden({})}
          />
        );
      }
      render(<Host />);
      fireEvent.click(screen.getAllByRole("button", { name: "Hide this note" })[0] as HTMLElement);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide this note" }));
      fireEvent.click(screen.getByRole("button", { name: "Hide this note" }));
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show 2 hidden" }));
    });
  });
});
