// src/ui/Summary.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_CODE } from "../app/state";
import { NOTICE_CODES } from "../layout";
import { Summary } from "./Summary";
import type { SummaryProps } from "./Summary";

afterEach(cleanup);

function props(over: Partial<SummaryProps> = {}): SummaryProps {
  return {
    summary: {
      fillPct: 81.4,
      trayCount: 7,
      stackCount: 4,
      filamentG: 412.2,
      playX: 1.2,
      playY: 1.8,
    },
    run: { status: "done" },
    notices: [],
    hasLayout: true,
    canUndo: true,
    canOptimize: true,
    shortfall: null,
    onReoptimize: vi.fn(),
    onImprove: vi.fn(),
    onUndo: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
}

describe("Summary", () => {
  it("shows the numbers with an upper-bound filament and play warnings", () => {
    render(<Summary {...props()} />);
    expect(screen.getByText("81 %")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText(/≤ 413 g/)).toBeTruthy();
    expect(screen.getByText(/upper bound/)).toBeTruthy();
    expect(screen.getByText("1.2 mm").className).not.toContain("play-warn");
    expect(screen.getByText("1.8 mm").className).toContain("play-warn");
  });

  it("shows progress and cancels while running", () => {
    const p = props({ run: { status: "running", done: 250, total: 1000 } });
    render(<Summary {...p} />);
    expect(screen.getByRole("status").textContent).toContain("25%");
    expect(screen.getByRole("progressbar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onCancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Re-optimize" }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps the last good result visible on failure and retries", () => {
    const p = props({ run: { status: "error", message: "Worker crashed" } });
    render(<Summary {...p} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Worker crashed.*last good layout/);
    expect(screen.getByText("81 %")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(p.onRetry).toHaveBeenCalled();
  });

  it("offers re-optimize on the stale notice and wires the buttons", () => {
    const p = props({
      notices: [
        {
          level: "info",
          code: STALE_CODE,
          message: "Inputs changed since this layout was made — re-optimize?",
        },
      ],
    });
    render(<Summary {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Re-optimize now" }));
    fireEvent.click(screen.getByRole("button", { name: "Improve more" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo layout" }));
    expect(p.onReoptimize).toHaveBeenCalledTimes(1);
    expect(p.onImprove).toHaveBeenCalledTimes(1);
    expect(p.onUndo).toHaveBeenCalledTimes(1);
  });

  it("explains an empty project and an infeasible run", () => {
    const view = render(
      <Summary
        {...props({
          summary: null,
          hasLayout: false,
          canUndo: false,
          canOptimize: false,
          run: { status: "idle" },
        })}
      />,
    );
    expect(screen.getByText(/add at least one component/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Improve more" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Undo layout" }).hasAttribute("disabled")).toBe(true);
    view.rerender(
      <Summary
        {...props({ summary: null, hasLayout: false, shortfall: { x: 12.345, y: 0, z: 3 } })}
      />,
    );
    // rounded up to 0.1 mm like plan 4's notice, never to the nearest
    expect(screen.getByText(/Doesn't fit/).textContent).toBe(
      "Doesn't fit: short by 12.4 mm left–right and 3.0 mm in height.",
    );
    view.rerender(
      <Summary
        {...props({ summary: null, hasLayout: false, shortfall: { x: 0.03, y: 0, z: 0 } })}
      />,
    );
    expect(screen.getByText(/Doesn't fit/).textContent).toBe(
      "Doesn't fit: short by 0.1 mm left–right.",
    );
  });

  it('shows no "short by" line when no axis is short and lets the notice name the tray', () => {
    const message =
      'The components don\'t fit in this box. Too large for the print bed: "Boards" is 121.0 × 44.0 × 14.0 mm; the usable bed is 120.0 × 120.0 mm.';
    render(
      <Summary
        {...props({
          summary: null,
          hasLayout: false,
          shortfall: { x: 0, y: 0, z: 0 },
          notices: [{ level: "error", code: NOTICE_CODES.doesNotFit, message }],
        })}
      />,
    );
    expect(screen.queryByText(/short by/)).toBeNull();
    expect(screen.getByText(/Too large for the print bed/).textContent).toBe(message);
  });
});
