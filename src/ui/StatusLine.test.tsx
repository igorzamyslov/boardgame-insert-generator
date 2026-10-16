// src/ui/StatusLine.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LockConflict } from "../layout/types";
import { StatusLine } from "./StatusLine";
import type { StatusLineProps } from "./StatusLine";

afterEach(cleanup);

function props(over: Partial<StatusLineProps> = {}): StatusLineProps {
  return {
    run: { status: "done" },
    pending: false,
    canOptimize: true,
    hasLayout: true,
    fits: { trays: 7, layers: 2, height: 81.04, boxHeight: 90 },
    canSearchMore: true,
    noFit: null,
    conflicts: [],
    onKeepSearching: vi.fn(),
    onStop: vi.fn(),
    onEdit: vi.fn(),
    onUnpin: vi.fn(),
    ...over,
  };
}

const text = (container: Element): string => container.textContent?.replace(/\s+/g, " ") ?? "";

describe("StatusLine", () => {
  it("says that everything fits, with the trays, the layers and the height", () => {
    const view = render(<StatusLine {...props()} />);
    expect(text(view.container)).toContain(
      "Everything fits. 7 trays in 2 layers, 81 of 90 mm high.",
    );
    view.rerender(
      <StatusLine {...props({ fits: { trays: 1, layers: 1, height: 40, boxHeight: 40 } })} />,
    );
    expect(text(view.container)).toContain("1 tray in 1 layer, 40 of 40 mm high");
  });

  it("calls Keep searching, and leaves it out for a plan from older geometry", () => {
    const p = props();
    const view = render(<StatusLine {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep searching" }));
    expect(p.onKeepSearching).toHaveBeenCalledTimes(1);
    view.rerender(<StatusLine {...props({ canSearchMore: false })} />);
    expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
    expect(text(view.container)).toContain("Everything fits.");
  });

  it("Keep searching becomes Stop while running", () => {
    const p = props();
    const view = render(<StatusLine {...p} />);
    expect(screen.getByRole("button", { name: "Keep searching" })).toBeTruthy();
    view.rerender(
      <StatusLine
        {...props({ ...p, pending: true, run: { status: "running", done: 250, total: 1000 } })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Updating the plan" })).toBeTruthy();
    expect(screen.getByText("25%").getAttribute("aria-hidden")).toBe("true");
    expect(text(view.container)).not.toContain("Everything fits");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(p.onStop).toHaveBeenCalledTimes(1);
    expect(p.onKeepSearching).not.toHaveBeenCalled();
  });

  it("hands the focus from Keep searching to Stop and back", () => {
    const p = props();
    const view = render(<StatusLine {...p} />);
    const keep = screen.getByRole("button", { name: "Keep searching" });
    keep.focus();
    fireEvent.click(keep);
    view.rerender(
      <StatusLine
        {...props({ ...p, pending: true, run: { status: "running", done: 1, total: 10 } })}
      />,
    );
    const stop = screen.getByRole("button", { name: "Stop" });
    expect(document.activeElement).toBe(stop);
    fireEvent.click(stop);
    view.rerender(<StatusLine {...props(p)} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep searching" }));
  });

  it("does not take the focus when the person moved it elsewhere", () => {
    const p = props();
    const view = render(
      <>
        <input aria-label="elsewhere" />
        <StatusLine {...p} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep searching" }));
    screen.getByLabelText("elsewhere").focus();
    view.rerender(
      <>
        <input aria-label="elsewhere" />
        <StatusLine
          {...props({ ...p, pending: true, run: { status: "running", done: 1, total: 10 } })}
        />
      </>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("elsewhere"));
  });

  it("clamps the percent to 100 and never shows a zero-sized bar", () => {
    const run = (done: number, total: number): StatusLineProps =>
      props({ pending: true, run: { status: "running", done, total } });
    const view = render(<StatusLine {...run(1200, 1000)} />);
    expect(screen.getByText("100%")).toBeTruthy();
    view.rerender(<StatusLine {...run(0, 0)} />);
    expect(screen.getByText("0%")).toBeTruthy();
    expect(Number(screen.getByRole("progressbar").getAttribute("max"))).toBeGreaterThan(0);
  });

  it("never shows a percent lower than one already shown during a run", () => {
    const run = (done: number, total: number): StatusLineProps =>
      props({ pending: true, run: { status: "running", done, total } });
    const view = render(<StatusLine {...run(400, 2000)} />);
    expect(screen.getByText("20%")).toBeTruthy();
    view.rerender(<StatusLine {...run(400, 1000)} />);
    expect(screen.getByText("40%")).toBeTruthy();
    view.rerender(<StatusLine {...run(400, 2000)} />);
    expect(screen.queryByText("20%")).toBeNull();
    expect(screen.getByText("40%")).toBeTruthy();
    // a new run starts from zero again
    view.rerender(<StatusLine {...props()} />);
    view.rerender(<StatusLine {...run(100, 2000)} />);
    expect(screen.getByText("5%")).toBeTruthy();
  });

  it("starts the bar again when a new run replaces a running one", () => {
    const run = (done: number, total: number): StatusLineProps =>
      props({ pending: true, run: { status: "running", done, total } });
    const view = render(<StatusLine {...run(600, 1000)} />);
    expect(screen.getByText("60%")).toBeTruthy();
    // a new run starts without an idle state in between (open or switch project)
    view.rerender(<StatusLine {...run(0, 1000)} />);
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.queryByText("60%")).toBeNull();
    view.rerender(<StatusLine {...run(100, 1000)} />);
    expect(screen.getByText("10%")).toBeTruthy();
  });

  it("says the plan is updating while a run waits to start, with nothing to press", () => {
    const view = render(<StatusLine {...props({ pending: true, fits: null })} />);
    expect(text(view.container)).toBe("Updating the plan…");
    expect(screen.queryByRole("button")).toBeNull();
  });

  describe("when the search found no fit", () => {
    const misfit = { componentId: "c1", name: "Boards", reason: "box" as const };

    it("names the component that does not fit", () => {
      const p = props({ fits: null, noFit: { misfit } });
      const view = render(<StatusLine {...p} />);
      expect(text(view.container)).toContain("Boards doesn't fit the box yet");
      expect(text(view.container)).not.toContain("Everything fits");
      fireEvent.click(screen.getByRole("button", { name: "Edit Boards" }));
      expect(p.onEdit).toHaveBeenCalledWith("c1");
      fireEvent.click(screen.getByRole("button", { name: "Keep searching" }));
      expect(p.onKeepSearching).toHaveBeenCalledTimes(1);
    });

    it("says a tray is too big for the printer's bed when that is the reason", () => {
      const view = render(
        <StatusLine {...props({ fits: null, noFit: { misfit: { ...misfit, reason: "bed" } } })} />,
      );
      expect(text(view.container)).toContain("Boards is too big for your printer's bed");
      expect(screen.getByRole("button", { name: "Edit Boards" })).toBeTruthy();
    });

    it("keeps Keep searching out of sight on a phone, so the name has room", () => {
      render(<StatusLine {...props({ fits: null, noFit: { misfit } })} />);
      expect(screen.getByRole("button", { name: "Keep searching" }).className).toContain(
        "pf-status__btn--phone-off",
      );
      expect(screen.getByRole("button", { name: "Edit Boards" }).className).not.toContain(
        "phone-off",
      );
    });

    it("still says so when no component stands out, and offers no edit", () => {
      const view = render(<StatusLine {...props({ fits: null, noFit: { misfit: null } })} />);
      expect(text(view.container)).toContain("The trays don't fit the box yet");
      expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
      expect(screen.getByRole("button", { name: "Keep searching" })).toBeTruthy();
    });

    it("works without a plan behind it", () => {
      render(<StatusLine {...props({ hasLayout: false, fits: null, noFit: { misfit } })} />);
      expect(screen.getByRole("button", { name: "Edit Boards" })).toBeTruthy();
    });
  });

  describe("when pins block the fit", () => {
    const conflicts: LockConflict[] = [
      { trayKey: "a", kind: "position", name: "Boards", reason: "it is too big for its spot" },
      { trayKey: "b", kind: "stack", name: "Deck, Tokens", reason: "they need a taller box" },
    ];

    it("offers to unpin each conflicting pin", () => {
      const p = props({ fits: null, conflicts });
      const view = render(<StatusLine {...p} />);
      expect(text(view.container)).toContain("Boards doesn't fit with your pins");
      expect(text(view.container)).toContain("Deck, Tokens doesn't fit with your pins");
      expect(screen.getAllByRole("button", { name: /^Unpin / })).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "Unpin Deck, Tokens" }));
      expect(p.onUnpin).toHaveBeenCalledWith(conflicts[1]);
      fireEvent.click(screen.getByRole("button", { name: "Unpin Boards" }));
      expect(p.onUnpin).toHaveBeenLastCalledWith(conflicts[0]);
    });

    it("tells a size pin from a position pin of the same tray", () => {
      render(
        <StatusLine
          {...props({
            fits: null,
            conflicts: [
              { trayKey: "a", kind: "position", name: "Boards", reason: "x" },
              { trayKey: "a", kind: "size", name: "Boards", reason: "y" },
            ],
          })}
        />,
      );
      expect(screen.getByRole("button", { name: "Unpin Boards" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Unpin size of Boards" })).toBeTruthy();
    });

    it("speaks before a no-fit, and has no Keep searching of its own", () => {
      render(<StatusLine {...props({ fits: null, conflicts, noFit: { misfit: null } })} />);
      expect(screen.queryByText(/The trays don't fit/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
    });
  });

  describe("when there is nothing to say", () => {
    it("is empty while the inputs have errors", () => {
      const view = render(<StatusLine {...props({ canOptimize: false })} />);
      expect(view.container.firstChild).toBeNull();
    });

    it("is empty for a plan out of date (the banner speaks)", () => {
      const view = render(<StatusLine {...props({ fits: null })} />);
      expect(view.container.firstChild).toBeNull();
    });

    it("offers Make a plan when there is no plan and none is on its way", () => {
      const p = props({ hasLayout: false, fits: null });
      const view = render(<StatusLine {...p} />);
      expect(text(view.container)).toContain("No plan yet");
      fireEvent.click(screen.getByRole("button", { name: "Make a plan" }));
      expect(p.onKeepSearching).toHaveBeenCalledTimes(1);
    });
  });
});
