// src/ui/Summary.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_CODE } from "../app/state";
import { NOTICE_CODES, mmUp } from "../layout";
import { createCtx } from "../layout/context";
import { boxReq, fakeMeasure, makeInput } from "../layout/test-utils";
import { doesNotFitNotice } from "../layout/warnings";
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
    hasComponents: true,
    hiddenErrors: [],
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
    expect(screen.getByText("1.20 mm").className).not.toContain("play-warn");
    expect(screen.getByText("1.80 mm").className).toContain("play-warn");
  });

  it("shows progress and cancels while running", () => {
    const p = props({ run: { status: "running", done: 250, total: 1000 } });
    render(<Summary {...p} />);
    expect(screen.getByText(/25%/)).toBeTruthy();
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

  describe("when the optimizer is blocked", () => {
    const blocked = (over: Partial<SummaryProps>) =>
      props({ summary: null, hasLayout: false, canUndo: false, canOptimize: false, ...over });

    it("asks for the box size and a component when there are none", () => {
      render(<Summary {...blocked({ hasComponents: false })} />);
      expect(screen.getByText(/Enter the box size and add at least one component/)).toBeTruthy();
      expect(screen.queryByText(/Fix the errors/)).toBeNull();
    });

    it("points at the marked inputs when components exist, instead of asking for them", () => {
      render(<Summary {...blocked({})} />);
      expect(screen.getByText(/Fix the errors marked in the inputs/)).toBeTruthy();
      expect(screen.queryByText(/add at least one component/)).toBeNull();
    });

    it("lists the errors that have no field on screen", () => {
      const hiddenErrors = [
        { level: "error" as const, code: "field.bottomChamfer", message: "Chamfer too big." },
        { level: "error" as const, code: "invalid.lock", message: "Lock 1 is broken." },
      ];
      render(<Summary {...blocked({ hiddenErrors })} />);
      const list = screen.getByRole("list", { name: "Errors without a field" });
      expect(Array.from(list.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
        "Chamfer too big.",
        "Lock 1 is broken.",
      ]);
    });

    it("explains the disabled buttons when a layout is shown", () => {
      render(<Summary {...props({ canOptimize: false })} />);
      expect(screen.getByText(/Fix the errors marked in the inputs/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Re-optimize" }).hasAttribute("disabled")).toBe(
        true,
      );
    });

    it("says nothing while the optimizer can run", () => {
      render(<Summary {...props({ summary: null, hasLayout: false })} />);
      expect(screen.queryByText(/Fix the errors/)).toBeNull();
      expect(screen.getByText("No layout yet.")).toBeTruthy();
    });
  });

  it("explains an empty project and an infeasible run", () => {
    const view = render(
      <Summary
        {...props({
          summary: null,
          hasLayout: false,
          canUndo: false,
          canOptimize: false,
          hasComponents: false,
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

  it("announces only the start and the end of a run, not every percent", () => {
    const view = render(<Summary {...props({ run: { status: "idle" } })} />);
    const live = screen.getByRole("status");
    expect(live.textContent).toBe("");
    view.rerender(<Summary {...props({ run: { status: "running", done: 250, total: 1000 } })} />);
    expect(live.textContent).toBe("Optimizing the layout…");
    // the bar, the percent and Cancel are outside the live region
    expect(live.contains(screen.getByRole("progressbar"))).toBe(false);
    expect(live.contains(screen.getByRole("button", { name: "Cancel" }))).toBe(false);
    expect(live.textContent).not.toMatch(/%/);
    view.rerender(<Summary {...props({ run: { status: "running", done: 500, total: 1000 } })} />);
    expect(live.textContent).toBe("Optimizing the layout…");
    view.rerender(<Summary {...props({ run: { status: "done" } })} />);
    expect(live.textContent).toBe("Layout updated.");
  });

  it("clamps the percent to 100 and never renders a zero-sized bar", () => {
    const view = render(
      <Summary {...props({ run: { status: "running", done: 1200, total: 1000 } })} />,
    );
    expect(screen.getByText(/100%/)).toBeTruthy();
    view.rerender(<Summary {...props({ run: { status: "running", done: 0, total: 0 } })} />);
    expect(screen.getByText(/0%/)).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(Number(bar.getAttribute("max"))).toBeGreaterThan(0);
  });

  it("never shows a percent lower than one already shown during a run", () => {
    const view = render(
      <Summary {...props({ run: { status: "running", done: 400, total: 2000 } })} />,
    );
    expect(screen.getByText(/20%/)).toBeTruthy();
    // the total shrinks (the run found it needs fewer steps): 400/1000 = 40%, which is higher
    view.rerender(<Summary {...props({ run: { status: "running", done: 400, total: 1000 } })} />);
    expect(screen.getByText(/40%/)).toBeTruthy();
    // a total that grows again would read 20%, so the bar keeps 40%
    view.rerender(<Summary {...props({ run: { status: "running", done: 400, total: 2000 } })} />);
    expect(screen.queryByText(/20%/)).toBeNull();
    expect(screen.getByText(/40%/)).toBeTruthy();
    // a new run starts from zero again
    view.rerender(<Summary {...props({ run: { status: "done" } })} />);
    view.rerender(<Summary {...props({ run: { status: "running", done: 100, total: 2000 } })} />);
    expect(screen.getByText(/5%/)).toBeTruthy();
  });

  it("shows the play with two decimals, like the play notice", () => {
    render(
      <Summary
        {...props({
          summary: {
            fillPct: 50,
            trayCount: 1,
            stackCount: 1,
            filamentG: 1,
            playX: 1.504,
            playY: 1.5,
          },
        })}
      />,
    );
    // 1.504 mm is over the 1.5 mm limit, and shown as such (not as "1.5 mm")
    const [x, y] = screen.getAllByText("1.50 mm");
    expect(x?.className).toContain("play-warn");
    expect(y?.className).not.toContain("play-warn");
  });

  it("does not double the period of an error message", () => {
    const view = render(
      <Summary {...props({ run: { status: "error", message: "Worker crashed." } })} />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "The optimizer failed: Worker crashed. ",
    );
    expect(screen.getByRole("alert").textContent).not.toContain("..");
    view.rerender(<Summary {...props({ run: { status: "error", message: "Worker crashed" } })} />);
    expect(screen.getByRole("alert").textContent).toContain("Worker crashed. ");
    view.rerender(<Summary {...props({ run: { status: "error", message: "Out of memory?" } })} />);
    expect(screen.getByRole("alert").textContent).not.toContain("?.");
  });

  it("states a shortfall the way the real doesNotFit notice does", () => {
    const ctx = createCtx(makeInput([boxReq("bits", 40, 40, 10)]), fakeMeasure);
    for (const x of [0.01, 0.04, 0.1, 12.345, 12.34, 99.99]) {
      const notice = doesNotFitNotice(ctx, { x, y: 0.07, z: 3 });
      const view = render(
        <Summary
          {...props({
            summary: null,
            hasLayout: false,
            shortfall: { x, y: 0.07, z: 3 },
            notices: [notice],
          })}
        />,
      );
      const line = screen.getByText(/Doesn't fit/).textContent ?? "";
      expect(line).toContain(`${mmUp(x)} mm left–right`);
      expect(line).toContain(`${mmUp(0.07)} mm front–back`);
      expect(notice.message).toContain(`${mmUp(x)} mm in width (X)`);
      expect(notice.message).toContain(`${mmUp(0.07)} mm in depth (Y)`);
      view.unmount();
    }
  });

  it("starts the bar again when a new run replaces a running one", () => {
    const view = render(
      <Summary {...props({ run: { status: "running", done: 600, total: 1000 } })} />,
    );
    expect(screen.getByText(/60%/)).toBeTruthy();
    // a new run starts without an idle state in between (open or switch project)
    view.rerender(<Summary {...props({ run: { status: "running", done: 0, total: 1000 } })} />);
    expect(screen.getByText(/Optimizing… 0%/)).toBeTruthy();
    expect(screen.queryByText(/60%/)).toBeNull();
    view.rerender(<Summary {...props({ run: { status: "running", done: 100, total: 1000 } })} />);
    expect(screen.getByText(/10%/)).toBeTruthy();
  });
});
