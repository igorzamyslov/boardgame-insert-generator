// src/ui/Summary.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunState } from "../app/state";
import { NOTICE_CODES } from "../layout";
import type { Notice } from "../model/types";
import { LAYOUT_NOTICES_SHOWN, SLOW_RUN_MS, Summary, formatPrintTime } from "./Summary";
import type { SummaryProps } from "./Summary";

afterEach(cleanup);

function props(over: Partial<SummaryProps> = {}): SummaryProps {
  return {
    summary: {
      fillPct: 81.4,
      trayCount: 7,
      stackCount: 4,
      filamentG: 412.2,
      filamentAtInfillG: 187.4,
      infillPct: 15,
      printMinutes: 90,
      longestPartMinutes: 30,
      playLimit: 1.5,
      fillerCount: 0,
      mergeFillers: true,
      mergeRisers: false,
      playX: 1.2,
      playY: 1.8,
      crossX: 3,
      crossY: 2,
    },
    run: { status: "done" },
    notices: [],
    hasLayout: true,
    canOptimize: true,
    hasComponents: true,
    hiddenErrors: [],
    problemSections: [],
    onShowSection: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
}

describe("Summary", () => {
  it("leaves the verdict and the search buttons to the status line", () => {
    const view = render(<Summary {...props()} />);
    expect(view.container.querySelector("p.pf-verdict")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^(Update plan|Keep searching|Cancel|Stop)$/ }),
    ).toBeNull();
    // the old readouts are gone
    expect(screen.queryByText("Box filled")).toBeNull();
    expect(screen.queryByText("Trays")).toBeNull();
    expect(screen.queryByText("Stacks")).toBeNull();
    // slackY 1.8 is over the limit
    expect(screen.getByText("Slack front–back").nextElementSibling?.className).toContain(
      "play-warn",
    );
  });

  it("has no Undo of its own: the header's Undo is the one", () => {
    render(<Summary {...props()} />);
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("shows the filament estimate at the infill beside the upper bound, and states the assumptions", () => {
    render(<Summary {...props()} />);
    const estimate = screen.getByText(/estimate: PLA, 15 % infill/).nextElementSibling;
    expect(estimate?.textContent).toMatch(/≈ 187\s*g/);
    expect(screen.getByText(/upper bound/).nextElementSibling?.textContent).toMatch(/≤ 413\s*g/);
    expect(document.body.textContent).toMatch(/3 perimeters and the top and bottom 5 layers/);
  });

  it("shows the slack, an upper-bound filament and slack warnings", () => {
    render(<Summary {...props()} />);
    const filament = screen.getByText(/upper bound/).nextElementSibling;
    expect(filament?.textContent).toMatch(/≤ 413\s*g/);
    const x = screen.getByText("Slack left–right").nextElementSibling;
    const y = screen.getByText("Slack front–back").nextElementSibling;
    expect(x?.textContent).toMatch(/^1\.20\s*mm$/);
    expect(x?.className).not.toContain("play-warn");
    expect(y?.textContent).toMatch(/^1\.80\s*mm$/);
    expect(y?.className).toContain("play-warn");
  });

  it("judges the slack against the play limit the summary was made under, and quotes it", () => {
    const base = props().summary;
    if (!base) {
      throw new Error("no summary");
    }
    // playY 1.8 is over the default 1.5 mm but under a raised 2 mm limit
    const { container, unmount } = render(
      <Summary {...props({ summary: { ...base, playLimit: 2 } })} />,
    );
    expect(screen.getByText("Slack front–back").nextElementSibling?.className).not.toContain(
      "play-warn",
    );
    expect(container.textContent).toContain("Above 2 mm");
    expect(container.textContent).not.toContain("Above 1.5 mm");
    unmount();
    // and a lowered 1 mm limit warns on both axes
    render(<Summary {...props({ summary: { ...base, playLimit: 1 } })} />);
    expect(screen.getByText("Slack left–right").nextElementSibling?.className).toContain(
      "play-warn",
    );
    expect(document.body.textContent).toContain("Above 1 mm");
  });

  it("shows a rough print time and the longest part, and states the assumptions", () => {
    const { container } = render(<Summary {...props()} />);
    // fixture: 90 min in all, 30 min for the longest part
    expect(screen.getByText(/^Print time/).nextElementSibling?.textContent).toBe("≈ 1.5 h");
    expect(screen.getByText("Longest single piece").nextElementSibling?.textContent).toBe(
      "≈ 30 min",
    );
    expect(container.textContent).toMatch(/steady 4 mm³\/s, and nothing else/);
    expect(container.textContent).toMatch(/real print usually takes longer/);
  });

  it("formats a print time to the nearest 5 minutes, then the nearest half hour", () => {
    expect(formatPrintTime(0.4)).toBe("5 min");
    expect(formatPrintTime(32)).toBe("30 min");
    expect(formatPrintTime(59)).toBe("1 h");
    expect(formatPrintTime(60)).toBe("1 h");
    expect(formatPrintTime(614)).toBe("10 h");
    expect(formatPrintTime(640)).toBe("10.5 h");
  });

  it("keeps the last good result visible on failure and retries", () => {
    const p = props({ run: { status: "error", message: "Worker crashed" } });
    render(<Summary {...p} />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("pf-notice--error");
    expect(alert.textContent).toMatch(
      /The plan couldn't be updated\. Worker crashed\. The plan shown is the last good one, from before your latest change\./,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(p.onRetry).toHaveBeenCalled();
  });

  describe("when the optimizer is blocked", () => {
    const blocked = (over: Partial<SummaryProps>) =>
      props({ summary: null, hasLayout: false, canOptimize: false, ...over });

    it("says nothing about errors when there are no components", () => {
      render(<Summary {...blocked({ hasComponents: false })} />);
      expect(screen.queryByText(/Fix the errors/)).toBeNull();
      expect(screen.queryByText(/Enter the box size/)).toBeNull();
    });

    it("points at the marked inputs when components exist", () => {
      const view = render(<Summary {...blocked({})} />);
      expect(screen.getByText(/Fix the errors marked in the inputs/)).toBeTruthy();
      expect(view.container.querySelector(".optimizer-blocked")).toBeTruthy();
    });

    it("offers a Show button per section with an error and reports the one clicked", () => {
      const problemSections = [
        { id: "box", title: "Box" },
        { id: "settings", title: "Settings" },
      ];
      const p = blocked({ problemSections });
      render(<Summary {...p} />);
      fireEvent.click(screen.getByRole("button", { name: "Show Settings" }));
      expect(p.onShowSection).toHaveBeenCalledTimes(1);
      expect(p.onShowSection).toHaveBeenCalledWith("settings");
      fireEvent.click(screen.getByRole("button", { name: "Show Box" }));
      expect(p.onShowSection).toHaveBeenLastCalledWith("box");
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

    it("explains what to fix when a layout is shown", () => {
      render(<Summary {...props({ canOptimize: false })} />);
      expect(screen.getByText(/Fix the errors marked in the inputs/)).toBeTruthy();
    });

    it("says nothing while the optimizer can run", () => {
      render(<Summary {...props({ summary: null, hasLayout: false })} />);
      expect(screen.queryByText(/Fix the errors/)).toBeNull();
      expect(screen.queryByText("No layout yet.")).toBeNull();
    });
  });

  it('shows the doesNotFit notice, and no second "short by" line of its own', () => {
    const message =
      'The components don\'t fit in this box. Too large for the print bed: "Boards" is 121.0 × 44.0 × 14.0 mm; the usable bed is 120.0 × 120.0 mm.';
    render(
      <Summary
        {...props({
          summary: null,
          hasLayout: false,
          notices: [{ level: "error", code: NOTICE_CODES.doesNotFit, message }],
        })}
      />,
    );
    expect(screen.queryByText(/short by/)).toBeNull();
    expect(screen.getByText(/Too large for the print bed/).textContent).toBe(message);
  });

  describe("the live region", () => {
    const running = (kind?: "edit" | "improve", done = 250): RunState => ({
      status: "running",
      done,
      total: 1000,
      kind,
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** The run's own region (the notices have an empty one of their own). */
    const liveRegion = (): HTMLElement => {
      const el = document.querySelector<HTMLElement>("[data-live='run']");
      if (el === null) {
        throw new Error("the run's live region is not on the page");
      }
      return el;
    };

    it("is there from the start, empty, so a reader hears the words arrive", () => {
      const view = render(<Summary {...props({ run: { status: "idle" } })} />);
      const live = liveRegion();
      expect(live.textContent).toBe("");
      view.rerender(<Summary {...props({ run: running("improve") })} />);
      expect(liveRegion()).toBe(live);
    });

    it("announces Keep searching at the start and at the end, never the percent", () => {
      const view = render(<Summary {...props({ run: { status: "idle" } })} />);
      const live = liveRegion();
      view.rerender(<Summary {...props({ run: running("improve") })} />);
      expect(live.textContent).toBe("Searching…");
      expect(live.textContent).not.toMatch(/%/);
      view.rerender(<Summary {...props({ run: running("improve", 500) })} />);
      expect(live.textContent).toBe("Searching…");
      view.rerender(<Summary {...props({ run: { status: "done" } })} />);
      expect(live.textContent).toBe("Search finished.");
    });

    it("keeps quiet about a new plan that takes under a second, like saving", () => {
      vi.useFakeTimers();
      const view = render(<Summary {...props({ run: { status: "idle" } })} />);
      const live = liveRegion();
      view.rerender(<Summary {...props({ run: running("edit") })} />);
      act(() => {
        vi.advanceTimersByTime(SLOW_RUN_MS - 100);
      });
      expect(live.textContent).toBe("");
      view.rerender(<Summary {...props({ run: { status: "done" } })} />);
      act(() => {
        vi.advanceTimersByTime(SLOW_RUN_MS);
      });
      expect(live.textContent).toBe("");
    });

    it("announces a new plan that is slow, and when it is ready", () => {
      vi.useFakeTimers();
      const view = render(<Summary {...props({ run: { status: "idle" } })} />);
      const live = liveRegion();
      view.rerender(<Summary {...props({ run: running("edit") })} />);
      act(() => {
        vi.advanceTimersByTime(SLOW_RUN_MS + 10);
      });
      expect(live.textContent).toBe("Making a new plan…");
      view.rerender(<Summary {...props({ run: { status: "done" } })} />);
      expect(live.textContent).toBe("Plan updated.");
    });
  });

  it("shows the slack with two decimals, like the play notice", () => {
    render(
      <Summary
        {...props({
          summary: {
            fillPct: 50,
            trayCount: 1,
            stackCount: 1,
            filamentG: 1,
            filamentAtInfillG: 1,
            infillPct: 15,
            printMinutes: 90,
            longestPartMinutes: 30,
            playLimit: 1.5,
            fillerCount: 0,
            mergeFillers: true,
            mergeRisers: false,
            playX: 1.504,
            playY: 1.5,
            crossX: 3,
            crossY: 2,
          },
        })}
      />,
    );
    // 1.504 mm is over the 1.5 mm limit, and shown as such (not as "1.5 mm")
    const x = screen.getByText("Slack left–right").nextElementSibling;
    const y = screen.getByText("Slack front–back").nextElementSibling;
    expect(x?.textContent).toMatch(/^1\.50\s*mm$/);
    expect(y?.textContent).toMatch(/^1\.50\s*mm$/);
    expect(x?.className).toContain("play-warn");
    expect(y?.className).not.toContain("play-warn");
  });

  it("does not double the period of an error message", () => {
    const view = render(
      <Summary {...props({ run: { status: "error", message: "Worker crashed." } })} />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "The plan couldn't be updated. Worker crashed. ",
    );
    expect(screen.getByRole("alert").textContent).not.toContain("..");
    view.rerender(<Summary {...props({ run: { status: "error", message: "Worker crashed" } })} />);
    expect(screen.getByRole("alert").textContent).toContain("Worker crashed. ");
    view.rerender(<Summary {...props({ run: { status: "error", message: "Out of memory?" } })} />);
    expect(screen.getByRole("alert").textContent).not.toContain("?.");
  });

  it("keeps the results in view: folds all but the first few messages behind Show all", () => {
    const many: Notice[] = Array.from({ length: 12 }, (_, i) => ({
      level: "warning",
      code: `w.${i}`,
      message: `Warning number ${i}`,
    }));
    render(<Summary {...props({ notices: many })} />);
    const list = screen.getByRole("list", { name: "Layout messages" });
    expect(list.querySelectorAll("li")).toHaveLength(LAYOUT_NOTICES_SHOWN);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12 messages" }));
    expect(list.querySelectorAll("li")).toHaveLength(12);
  });
});
