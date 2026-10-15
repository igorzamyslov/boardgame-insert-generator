// src/ui/Summary.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALE_CODE } from "../app/state";
import { NOTICE_CODES, mmUp } from "../layout";
import { createCtx } from "../layout/context";
import { boxReq, fakeMeasure, makeInput } from "../layout/test-utils";
import { doesNotFitNotice } from "../layout/warnings";
import type { Notice } from "../model/types";
import { LAYOUT_NOTICES_SHOWN, Summary, formatPrintTime } from "./Summary";
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
    stale: false,
    layers: 2,
    spares: 0,
    canUndo: true,
    canOptimize: true,
    hasComponents: true,
    hiddenErrors: [],
    advanced: false,
    problemSections: [],
    onShowSection: vi.fn(),
    shortfall: null,
    onRefit: vi.fn(),
    onUndo: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
}

describe("Summary", () => {
  it("says in a sentence that everything fits, with the trays, layers and fill", () => {
    const view = render(<Summary {...props()} />);
    const verdict = view.container.querySelector("p.pf-verdict");
    expect(verdict?.textContent).toBe("Everything fits. 7 trays in 2 layers, 81% of the box used.");
    // the old readouts are gone
    expect(screen.queryByText("Box filled")).toBeNull();
    expect(screen.queryByText("Trays")).toBeNull();
    expect(screen.queryByText("Stacks")).toBeNull();
    // slackY 1.8 is over the limit, so the slack shows even in simple mode; the filament does not
    expect(screen.getByText("Slack front–back").nextElementSibling?.className).toContain(
      "play-warn",
    );
    expect(screen.queryByText(/upper bound/)).toBeNull();
  });

  it("uses the singular forms and names the spare trays", () => {
    const base = props().summary;
    const summary = base ? { ...base, trayCount: 1 } : null;
    const view = render(<Summary {...props({ summary, layers: 1, spares: 1 })} />);
    expect(view.container.querySelector("p.pf-verdict")?.textContent).toBe(
      "Everything fits. 1 tray (1 is a spare) in 1 layer, 81% of the box used.",
    );
    view.rerender(<Summary {...props({ layers: 3, spares: 2 })} />);
    expect(view.container.querySelector("p.pf-verdict")?.textContent).toBe(
      "Everything fits. 7 trays (2 are spares) in 3 layers, 81% of the box used.",
    );
  });

  it("leaves the sentence out when stale, running, or without a summary", () => {
    const view = render(<Summary {...props({ stale: true })} />);
    expect(view.container.querySelector("p.pf-verdict")).toBeNull();
    view.rerender(<Summary {...props({ run: { status: "running", done: 1, total: 10 } })} />);
    expect(view.container.querySelector("p.pf-verdict")).toBeNull();
    view.rerender(<Summary {...props({ summary: null })} />);
    expect(view.container.querySelector("p.pf-verdict")).toBeNull();
  });

  it("hides the slack and the filament in simple mode while the slack is within the limit", () => {
    const summary = {
      fillPct: 81,
      trayCount: 7,
      stackCount: 4,
      filamentG: 412,
      filamentAtInfillG: 190,
      infillPct: 15,
      printMinutes: 90,
      longestPartMinutes: 30,
      playLimit: 1.5,
      fillerCount: 0,
      mergeFillers: true,
      mergeRisers: false,
      playX: 1.2,
      playY: 1.3,
      crossX: 3,
      crossY: 2,
    };
    const view = render(<Summary {...props({ summary })} />);
    expect(view.container.querySelector("dl.pf-readouts")).toBeNull();
    expect(screen.queryByText(/^Slack/)).toBeNull();
    expect(screen.queryByText(/upper bound/)).toBeNull();
  });

  it("shows the filament estimate at the infill beside the upper bound, and states the assumptions", () => {
    render(<Summary {...props({ advanced: true })} />);
    const estimate = screen.getByText(/estimate: PLA, 15 % infill/).nextElementSibling;
    expect(estimate?.textContent).toMatch(/≈ 187\s*g/);
    expect(screen.getByText(/upper bound/).nextElementSibling?.textContent).toMatch(/≤ 413\s*g/);
    expect(document.body.textContent).toMatch(/3 perimeters and the top and bottom 5 layers/);
  });

  it("shows the slack, an upper-bound filament and slack warnings in advanced mode", () => {
    render(<Summary {...props({ advanced: true })} />);
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
    const base = props({ advanced: true }).summary;
    if (!base) {
      throw new Error("no summary");
    }
    // playY 1.8 is over the default 1.5 mm but under a raised 2 mm limit
    const { container, unmount } = render(
      <Summary {...props({ advanced: true, summary: { ...base, playLimit: 2 } })} />,
    );
    expect(screen.getByText("Slack front–back").nextElementSibling?.className).not.toContain(
      "play-warn",
    );
    expect(container.textContent).toContain("Above 2 mm");
    expect(container.textContent).not.toContain("Above 1.5 mm");
    unmount();
    // and a lowered 1 mm limit warns on both axes
    render(<Summary {...props({ advanced: true, summary: { ...base, playLimit: 1 } })} />);
    expect(screen.getByText("Slack left–right").nextElementSibling?.className).toContain(
      "play-warn",
    );
    expect(document.body.textContent).toContain("Above 1 mm");
  });

  it("shows the slack in simple mode only while it is over the limit in force", () => {
    const base = props().summary;
    if (!base) {
      throw new Error("no summary");
    }
    const { container, unmount } = render(
      <Summary {...props({ summary: { ...base, playLimit: 2 } })} />,
    );
    expect(container.querySelector("dl.pf-readouts")).toBeNull();
    unmount();
    const again = render(<Summary {...props({ summary: { ...base, playLimit: 1.5 } })} />);
    expect(again.container.querySelector("dl.pf-readouts")).not.toBeNull();
  });

  it("shows a rough print time and the longest part in advanced mode, and states the assumptions", () => {
    const { container } = render(<Summary {...props({ advanced: true })} />);
    // fixture: 90 min in all, 30 min for the longest part
    expect(screen.getByText(/^Print time/).nextElementSibling?.textContent).toBe("≈ 1.5 h");
    expect(screen.getByText("Longest single part").nextElementSibling?.textContent).toBe(
      "≈ 30 min",
    );
    expect(container.textContent).toMatch(/steady 4 mm³\/s, and nothing else/);
    expect(container.textContent).toMatch(/real print usually takes longer/);
    cleanup();
    render(<Summary {...props({ advanced: false })} />);
    expect(screen.queryByText(/^Print time/)).toBeNull();
  });

  it("formats a print time to the nearest 5 minutes, then the nearest half hour", () => {
    expect(formatPrintTime(0.4)).toBe("5 min");
    expect(formatPrintTime(32)).toBe("30 min");
    expect(formatPrintTime(59)).toBe("1 h");
    expect(formatPrintTime(60)).toBe("1 h");
    expect(formatPrintTime(614)).toBe("10 h");
    expect(formatPrintTime(640)).toBe("10.5 h");
  });

  it("shows progress and cancels while running", () => {
    const p = props({ run: { status: "running", done: 250, total: 1000 } });
    render(<Summary {...p} />);
    expect(screen.getByText(/25%/)).toBeTruthy();
    expect(screen.getByText(/25%/).getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("progressbar", { name: "Updating the plan" })).toBeTruthy();
    expect(document.querySelector("div.pf-notice")?.textContent).toContain("Updating the plan…");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onCancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("keeps the last good result visible on failure and retries", () => {
    const p = props({ run: { status: "error", message: "Worker crashed" } });
    render(<Summary {...p} />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("pf-notice--error");
    expect(alert.textContent).toMatch(
      /The plan couldn't be updated\. Worker crashed\. The plan shown is the last good one, from before your latest change\./,
    );
    expect(document.querySelector("p.pf-verdict")?.textContent).toContain("Everything fits.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(p.onRetry).toHaveBeenCalled();
  });

  it("has no button inside the stale notice: the main button is the one way to update", () => {
    const p = props({
      stale: true,
      notices: [
        {
          level: "info",
          code: STALE_CODE,
          message: "Inputs changed since this plan was made — update it?",
        },
      ],
    });
    render(<Summary {...p} />);
    expect(screen.queryByRole("button", { name: "Update plan now" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Update plan" })).toHaveLength(1);
  });

  it("wires the one search button and Undo layout", () => {
    const p = props();
    render(<Summary {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep searching" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo layout" }));
    expect(p.onRefit).toHaveBeenCalledTimes(1);
    expect(p.onUndo).toHaveBeenCalledTimes(1);
  });

  describe("the search button", () => {
    const hint = (b: HTMLElement): string =>
      (b.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");

    it('says "Keep searching" when the layout is current, and nothing else', () => {
      render(<Summary {...props()} />);
      const b = screen.getByRole("button", { name: "Keep searching" });
      expect(screen.queryByRole("button", { name: "Update plan" })).toBeNull();
      expect(b.hasAttribute("disabled")).toBe(false);
      expect(hint(b)).toMatch(/Searches on from this layout/);
      expect(hint(b)).toMatch(/never throws the layout away/);
    });

    it('says "Update plan" when the layout is stale', () => {
      const p = props({ stale: true });
      render(<Summary {...p} />);
      const b = screen.getByRole("button", { name: "Update plan" });
      expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
      expect(b.hasAttribute("disabled")).toBe(false);
      expect(hint(b)).toMatch(/Re-fits the trays to your current inputs/);
      expect(hint(b)).toMatch(/never throws it away/);
      fireEvent.click(b);
      expect(p.onRefit).toHaveBeenCalledTimes(1);
    });

    it('says "Update plan" when the layout is current but made under older geometry', () => {
      const p = props({ geometryOld: true });
      render(<Summary {...p} />);
      const b = screen.getByRole("button", { name: "Update plan" });
      expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
      expect(hint(b)).toMatch(/Rebuilds the trays with the current geometry/);
      fireEvent.click(b);
      expect(p.onRefit).toHaveBeenCalledTimes(1);
    });

    it("hints that a repeat searches longer after a search that found no fit", () => {
      const ctx = createCtx(makeInput([boxReq("bits", 40, 40, 10)]), fakeMeasure);
      render(
        <Summary
          {...props({
            summary: null,
            hasLayout: false,
            notices: [doesNotFitNotice(ctx, { x: 1, y: 0, z: 0 }, [], 50_000)],
          })}
        />,
      );
      const b = screen.getByRole("button", { name: "Update plan" });
      expect(hint(b)).toMatch(/Searches again for a fit, about 3 times longer/);
    });

    it('says "Update plan" and is enabled when there is no layout yet', () => {
      render(<Summary {...props({ summary: null, hasLayout: false, canUndo: false })} />);
      const b = screen.getByRole("button", { name: "Update plan" });
      expect(b.hasAttribute("disabled")).toBe(false);
    });

    it.each([
      ["running", { run: { status: "running" as const, done: 1, total: 10 } }],
      ["the optimizer is blocked", { canOptimize: false }],
    ])("is disabled while %s, in every state", (_name, over) => {
      for (const state of [{}, { stale: true }, { hasLayout: false, summary: null }]) {
        const view = render(<Summary {...props({ ...state, ...over })} />);
        const b = screen.getByRole("button", { name: /^(Update plan|Keep searching)$/ });
        expect(b.hasAttribute("disabled")).toBe(true);
        view.unmount();
      }
    });
  });

  describe("when the optimizer is blocked", () => {
    const blocked = (over: Partial<SummaryProps>) =>
      props({ summary: null, hasLayout: false, canUndo: false, canOptimize: false, ...over });

    it("says nothing about errors when there are no components", () => {
      render(<Summary {...blocked({ hasComponents: false })} />);
      expect(screen.queryByText(/Fix the errors/)).toBeNull();
      expect(screen.queryByText(/Enter the box size/)).toBeNull();
      expect(screen.queryByRole("button", { name: /^(Update plan|Keep searching)$/ })).toBeNull();
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

    it("explains the disabled buttons when a layout is shown", () => {
      render(<Summary {...props({ canOptimize: false })} />);
      expect(screen.getByText(/Fix the errors marked in the inputs/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(
        true,
      );
    });

    it("says nothing while the optimizer can run", () => {
      render(<Summary {...props({ summary: null, hasLayout: false })} />);
      expect(screen.queryByText(/Fix the errors/)).toBeNull();
      expect(screen.queryByText("No layout yet.")).toBeNull();
    });
  });

  it("shows the layout buttons only once there are components, and disables them as needed", () => {
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
    expect(screen.queryByRole("button", { name: /^(Update plan|Keep searching)$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo layout" })).toBeNull();
    view.rerender(
      <Summary
        {...props({
          summary: null,
          hasLayout: false,
          canUndo: false,
          shortfall: { x: 12.345, y: 0, z: 3 },
        })}
      />,
    );
    // no layout, optimizer can run: "Update plan", enabled (it starts the first run)
    expect(screen.getByRole("button", { name: "Update plan" }).hasAttribute("disabled")).toBe(
      false,
    );
    expect(screen.getByRole("button", { name: "Undo layout" }).hasAttribute("disabled")).toBe(true);
    // rounded up to 0.1 mm like plan 4's notice, never to the nearest
    expect(screen.getByText(/Closest attempt/).textContent).toBe(
      "Closest attempt so far is short by 12.4 mm left–right and 3.0 mm in height.",
    );
    view.rerender(
      <Summary
        {...props({ summary: null, hasLayout: false, shortfall: { x: 0.03, y: 0, z: 0 } })}
      />,
    );
    expect(screen.getByText(/Closest attempt/).textContent).toBe(
      "Closest attempt so far is short by 0.1 mm left–right.",
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
    expect(live.textContent).toBe("Updating the plan…");
    // the bar, the percent and Cancel are outside the live region
    expect(live.contains(screen.getByRole("progressbar"))).toBe(false);
    expect(live.contains(screen.getByRole("button", { name: "Cancel" }))).toBe(false);
    expect(live.textContent).not.toMatch(/%/);
    view.rerender(<Summary {...props({ run: { status: "running", done: 500, total: 1000 } })} />);
    expect(live.textContent).toBe("Updating the plan…");
    view.rerender(<Summary {...props({ run: { status: "done" } })} />);
    expect(live.textContent).toBe("Plan updated.");
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

  it("shows the slack with two decimals, like the play notice", () => {
    render(
      <Summary
        {...props({
          advanced: true,
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
      const line = screen.getByText(/Closest attempt/).textContent ?? "";
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
    expect(screen.getByText(/^0%$/)).toBeTruthy();
    expect(screen.queryByText(/60%/)).toBeNull();
    view.rerender(<Summary {...props({ run: { status: "running", done: 100, total: 1000 } })} />);
    expect(screen.getByText(/10%/)).toBeTruthy();
  });
});
