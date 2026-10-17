// src/screens/StageNotes.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { NOTICE_CODES } from "../layout";
import type { Notice } from "../model/types";
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
});
