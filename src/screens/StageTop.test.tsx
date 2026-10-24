// src/screens/StageTop.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTray } from "../app/test-helpers";
import type { LockConflict } from "../layout/types";
import { GEOMETRY_OLD_MESSAGE } from "../app/state";
import {
  PlanBanner,
  StageTop,
  conflictLine,
  shortfallSentence,
  layerOptions,
  problemAreas,
  statusOf,
} from "./StageTop";
import type { PlanBannerProps, StageTopProps, StatusInput } from "./StageTop";

afterEach(cleanup);

// two layers: 40 mm and 26 mm high
const TWO_LAYERS = [
  makeTray({ key: "a:p0:0", level: 0, h: 40 }),
  makeTray({ key: "b:p0:0", level: 0, h: 38, x: 100 }),
  makeTray({ key: "c:p0:0", level: 1, h: 26, z: 40 }),
];
const ONE_LAYER = [makeTray({ key: "a:p0:0", level: 0, h: 40 })];

function input(over: Partial<StatusInput> = {}): StatusInput {
  return {
    run: { status: "done" },
    pending: false,
    hasComponents: true,
    canOptimize: true,
    hasLayout: true,
    fits: { trays: 7, layers: 2, height: 81.04, boxHeight: 90 },
    canSearchMore: true,
    noFit: null,
    conflicts: [],
    hiddenErrors: [],
    problems: [],
    ...over,
  };
}

function props(over: Partial<StageTopProps> = {}): StageTopProps {
  return {
    ...input(),
    trays: TWO_LAYERS,
    layer: 0,
    onLayerChange: vi.fn(),
    view: "plan",
    onViewChange: vi.fn(),
    webgl: true,
    phone: false,
    onKeepSearching: vi.fn(),
    onStop: vi.fn(),
    onRetry: vi.fn(),
    onShow: vi.fn(),
    ...over,
  };
}

const more = (): HTMLElement => screen.getByRole("button", { name: "Plan options" });
/** Opens the ⋯ menu and presses "Try another arrangement" in it. */
const tryAnother = (): void => {
  fireEvent.click(more());
  fireEvent.click(screen.getByRole("button", { name: /^Try another arrangement/ }));
};
const h1 = (): HTMLElement => screen.getByRole("heading", { level: 1 });
const line = (): string => document.querySelector(".k-status__line")?.textContent ?? "";

describe("StageTop", () => {
  it("names the state in the one h1, with the trays, the layers and the height under it", () => {
    render(<StageTop {...props()} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1().textContent).toBe("Everything fits");
    expect(line()).toBe("7 trays · 2 layers · 81 of 90 mm");
    expect(document.querySelector('[data-region="status"]')).not.toBeNull();
  });

  it("says one tray in one layer in the singular", () => {
    render(<StageTop {...props({ fits: { trays: 1, layers: 1, height: 40, boxHeight: 40 } })} />);
    expect(line()).toBe("1 tray · 1 layer · 40 of 40 mm");
  });

  it("calls Try another arrangement from the ⋯ menu, and blocks it for a plan from older geometry", () => {
    const p = props();
    const view = render(<StageTop {...p} />);
    // not on the toolbar: one tap deep
    expect(screen.queryByRole("button", { name: /^Try another arrangement/ })).toBeNull();
    tryAnother();
    expect(p.onKeepSearching).toHaveBeenCalledTimes(1);
    view.rerender(<StageTop {...props({ canSearchMore: false })} />);
    fireEvent.click(more());
    const item = screen.getByRole("button", { name: /^Try another arrangement/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(h1().textContent).toBe("Everything fits");
  });

  it("Try another arrangement becomes Stop while running", () => {
    const p = props();
    const view = render(<StageTop {...p} />);
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    view.rerender(
      <StageTop
        {...props({
          ...p,
          pending: true,
          run: { status: "running", done: 250, total: 1000, kind: "improve" },
        })}
      />,
    );
    expect(h1().textContent).toBe("Searching…");
    // "Searching… Stop": Stop is on the title's line
    expect(h1().parentElement?.contains(screen.getByRole("button", { name: "Stop" }))).toBe(true);
    // the menu item is blocked while it runs
    fireEvent.click(more());
    expect(
      screen
        .getByRole("button", { name: /^Try another arrangement/ })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.click(more());
    expect(line()).toBe("This plan stays unless a better one turns up.");
    // no progress bar: Main shows none
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(p.onStop).toHaveBeenCalledTimes(1);
    expect(p.onKeepSearching).not.toHaveBeenCalled();
  });

  it("says Making a new plan… while an edit's run is pending, with nothing to press", () => {
    render(<StageTop {...props({ pending: true, fits: null })} />);
    expect(h1().textContent).toBe("Making a new plan…");
    expect(document.querySelector(".k-status__line")).toBeNull();
    for (const name of ["Stop", "Retry", "Make a plan"]) {
      expect(screen.queryByRole("button", { name }), name).toBeNull();
    }
  });

  it("says Making a new plan… while an edit's run goes, and lets it be stopped", () => {
    const run = (kind?: "edit" | "improve") =>
      props({ pending: true, run: { status: "running", done: 100, total: 1000, kind } });
    const view = render(<StageTop {...run("edit")} />);
    expect(h1().textContent).toBe("Making a new plan…");
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    view.rerender(<StageTop {...run()} />);
    expect(h1().textContent).toBe("Making a new plan…");
    expect(document.body.textContent).not.toContain("Updating");
  });

  it("hands the focus from Try another arrangement to Stop and back", () => {
    const p = props();
    const view = render(<StageTop {...p} />);
    more().focus();
    tryAnother();
    view.rerender(
      <StageTop
        {...props({ ...p, pending: true, run: { status: "running", done: 1, total: 10 } })}
      />,
    );
    const stop = screen.getByRole("button", { name: "Stop" });
    expect(document.activeElement).toBe(stop);
    fireEvent.click(stop);
    view.rerender(<StageTop {...props(p)} />);
    expect(document.activeElement).toBe(more());
  });

  it("does not take the focus when the person moved it elsewhere", () => {
    const p = props();
    const view = render(
      <>
        <input aria-label="elsewhere" />
        <StageTop {...p} />
      </>,
    );
    tryAnother();
    screen.getByLabelText("elsewhere").focus();
    view.rerender(
      <>
        <input aria-label="elsewhere" />
        <StageTop
          {...props({ ...p, pending: true, run: { status: "running", done: 1, total: 10 } })}
        />
      </>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("elsewhere"));
  });

  it("shows the run error with Retry", () => {
    const p = props({ run: { status: "error", message: "Worker crashed" } });
    render(<StageTop {...p} />);
    expect(h1().textContent).toBe("The plan couldn't be updated");
    expect(line()).toBe(
      "Worker crashed. The plan shown is the last good one, from before your latest change.",
    );
    expect(screen.getByRole("alert").textContent).toContain("Worker crashed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not double the full stop of an error message, nor claim a last good plan it has not", () => {
    const view = render(
      <StageTop
        {...props({ hasLayout: false, run: { status: "error", message: "Worker crashed." } })}
      />,
    );
    expect(line()).toBe("Worker crashed.");
    view.rerender(
      <StageTop
        {...props({ hasLayout: false, run: { status: "error", message: "Worker crashed" } })}
      />,
    );
    expect(line()).toBe("Worker crashed.");
    view.rerender(
      <StageTop
        {...props({ hasLayout: false, run: { status: "error", message: "Out of memory?" } })}
      />,
    );
    expect(line()).toBe("Out of memory?");
  });

  describe("when the inputs have errors", () => {
    const blocked = (over: Partial<StatusInput> = {}) =>
      props({ canOptimize: false, fits: null, hasLayout: false, ...over });

    it("says to fix the errors marked in the inputs", () => {
      render(<StageTop {...blocked()} />);
      expect(h1().textContent).toBe("Fix the errors marked in the inputs");
      expect(document.querySelector(".k-status[data-tone='error']")).not.toBeNull();
    });

    it("says nothing of errors when there is nothing inside", () => {
      render(<StageTop {...blocked({ hasComponents: false })} />);
      expect(h1().textContent).toBe("No plan yet");
    });

    it("lists the errors that have no field, one per line under the h1", () => {
      const hiddenErrors = [
        { level: "error" as const, code: "field.bottomChamfer", message: "Chamfer too big." },
        { level: "error" as const, code: "invalid.lock", message: "Lock 1 is broken." },
      ];
      render(<StageTop {...blocked({ hiddenErrors })} />);
      const list = screen.getByRole("list", { name: "Errors without a field" });
      expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
        "Chamfer too big.",
        "Lock 1 is broken.",
      ]);
      // under the h1, inside the heading's own text
      expect(list.closest(".k-status__text")?.contains(h1())).toBe(true);
    });

    it("sends the person to the input in error", () => {
      const problems = [
        { id: "c1", label: "Edit Market deck" },
        { id: "box", label: "Change the box" },
        { id: "settings", label: "Settings" },
      ];
      const p = blocked({ problems });
      render(<StageTop {...p} />);
      for (const { id, label } of problems) {
        fireEvent.click(screen.getByRole("button", { name: label }));
        expect(p.onShow).toHaveBeenLastCalledWith(id);
      }
      expect(p.onShow).toHaveBeenCalledTimes(3);
    });

    it("still says so while a layout is shown", () => {
      render(<StageTop {...props({ canOptimize: false })} />);
      expect(h1().textContent).toBe("Fix the errors marked in the inputs");
    });
  });

  describe("when a fit problem is on (the stage is FitProblem's, not the plan's)", () => {
    // FitProblem.test.tsx draws them; here only that the heading never offers the fixes itself
    it("leaves a conflict's Unpin to the panel, and has no Try another arrangement beside a no-fit", () => {
      const conflicts: LockConflict[] = [
        { trayKey: "a", kind: "position", name: "Boards", reason: "it is too big for its spot" },
      ];
      const view = render(<StageTop {...props({ fits: null, conflicts })} />);
      expect(h1().textContent).toBe("Boards doesn't fit with your pins");
      expect(screen.queryByRole("button", { name: /^Unpin / })).toBeNull();
      view.rerender(
        <StageTop
          {...props({
            fits: null,
            noFit: { misfit: { componentId: "c1", trayKey: "t", name: "Boards", reason: "box" } },
          })}
        />,
      );
      expect(h1().textContent).toBe("The Boards tray doesn't fit yet");
    });
  });

  describe("with no plan", () => {
    it("says No plan yet, and offers to make one", () => {
      const p = props({ hasLayout: false, fits: null, trays: undefined });
      render(<StageTop {...p} />);
      expect(h1().textContent).toBe("No plan yet");
      expect(document.querySelector(".k-status[data-tone='neutral']")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Make a plan" }));
      expect(p.onKeepSearching).toHaveBeenCalledTimes(1);
    });

    it("has no Layer or View switch without a plan", () => {
      render(<StageTop {...props({ hasLayout: false, fits: null, trays: undefined })} />);
      expect(screen.queryByRole("group", { name: "Layer" })).toBeNull();
      expect(screen.queryByRole("group", { name: "View" })).toBeNull();
    });
  });

  describe("the Layer switch", () => {
    it("labels layers by number, with no height", () => {
      render(<StageTop {...props()} />);
      const group = screen.getByRole("group", { name: "Layer" });
      const names = within(group)
        .getAllByRole("button")
        .map((b) => b.textContent);
      expect(names).toEqual(["Layer 1", "Layer 2", "All"]);
      expect(group.getAttribute("data-tone")).toBe("track");
    });

    it("has no Layer group for one layer", () => {
      render(<StageTop {...props({ trays: ONE_LAYER })} />);
      expect(screen.queryByRole("group", { name: "Layer" })).toBeNull();
    });

    it("presses the layer picked, and picks another", () => {
      const p = props({ layer: 1 });
      render(<StageTop {...p} />);
      expect(screen.getByRole("button", { name: "Layer 2" }).getAttribute("aria-pressed")).toBe(
        "true",
      );
      fireEvent.click(screen.getByRole("button", { name: "Layer 1" }));
      expect(p.onLayerChange).toHaveBeenCalledWith(0);
      fireEvent.click(screen.getByRole("button", { name: "All" }));
      expect(p.onLayerChange).toHaveBeenLastCalledWith(null);
    });

    it("reads a layer there is no longer a layer for as All", () => {
      render(<StageTop {...props({ layer: 7 })} />);
      expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("names the layers by number alone, bottom and top being the caption's words", () => {
      const three = [...TWO_LAYERS, makeTray({ key: "d:p0:0", level: 2, h: 20, z: 66 })];
      expect(layerOptions(three).map((o) => o.label)).toEqual([
        "Layer 1",
        "Layer 2",
        "Layer 3",
        "All",
      ]);
    });

    it("says no height, on any width: the status line holds the plan's height", () => {
      expect(layerOptions(TWO_LAYERS).map((o) => o.label)).toEqual(["Layer 1", "Layer 2", "All"]);
      for (const phone of [false, true]) {
        render(
          <StageTop
            {...props({ phone, fits: { trays: 3, layers: 2, height: 66, boxHeight: 70 } })}
          />,
        );
        expect(line()).toBe("3 trays · 2 layers · 66 of 70 mm");
        expect(screen.getByRole("group", { name: "Layer" }).textContent).not.toMatch(/mm/);
        cleanup();
      }
    });
  });

  describe("the Layer switch in both views", () => {
    const names = (): string[] =>
      within(screen.getByRole("group", { name: "Layer" }))
        .getAllByRole("button")
        .map((b) => b.textContent ?? "");
    const pressed = (): string[] =>
      within(screen.getByRole("group", { name: "Layer" }))
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent ?? "");

    it("has the same labels, in the same order, in Top and in 3D", () => {
      render(<StageTop {...props({ view: "plan" })} />);
      const top = names();
      cleanup();
      render(<StageTop {...props({ view: "3d" })} />);
      expect(names()).toEqual(top);
      expect(top).toEqual(["Layer 1", "Layer 2", "All"]);
    });

    it("presses what the pick says, in either view: All for null", () => {
      for (const view of ["plan", "3d"] as const) {
        render(<StageTop {...props({ view, layer: null })} />);
        expect(pressed()).toEqual(["All"]);
        cleanup();
        render(<StageTop {...props({ view, layer: 0 })} />);
        expect(pressed()).toEqual(["Layer 1"]);
        cleanup();
      }
    });

    it("reports a pick the same way in either view", () => {
      for (const view of ["plan", "3d"] as const) {
        const p = props({ view, layer: 0 });
        render(<StageTop {...p} />);
        fireEvent.click(screen.getByRole("button", { name: "Layer 2" }));
        expect(p.onLayerChange).toHaveBeenLastCalledWith(1);
        cleanup();
      }
    });

    it("has no switch at all for one layer, in either view", () => {
      render(<StageTop {...props({ view: "3d", trays: ONE_LAYER })} />);
      expect(screen.queryByRole("group", { name: "Layer" })).toBeNull();
    });
  });

  describe("the heading's row and the switches row (board WideStage2)", () => {
    const rows = (): { status: HTMLElement; row: HTMLElement | null } => ({
      status: document.querySelector('[data-region="status"]') as HTMLElement,
      row: document.querySelector(".stage-segs"),
    });

    it("puts the View switch and the ⋯ menu in the toolbar row, on the same line as the heading", () => {
      render(<StageTop {...props()} />);
      const { status } = rows();
      const extra = status.querySelector(".k-status__extra");
      expect(extra?.contains(screen.getByRole("group", { name: "View" }))).toBe(true);
      expect(extra?.contains(more())).toBe(true);
      expect(status.querySelector(".k-status__lead")?.contains(more())).toBe(false);
    });

    it("puts the Layer switch in a row of its own under the toolbar, not in it", () => {
      render(<StageTop {...props()} />);
      const { status, row } = rows();
      expect(row).not.toBeNull();
      expect(status.contains(row)).toBe(false);
      expect(status.compareDocumentPosition(row as HTMLElement)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(row?.classList.contains("stage-segs--phone")).toBe(false);
      expect(row?.querySelector('.stage-segs__layer [role="group"]')).not.toBeNull();
      expect(row?.querySelector('[data-region="view-switch"]')).toBeNull();
      expect(status.querySelector('[data-region="view-switch"] [role="group"]')).not.toBeNull();
    });

    it("keeps the View switch and ⋯ in the toolbar, with or without a Layer switch", () => {
      const { rerender } = render(<StageTop {...props()} />);
      const extra = (): Element | null => rows().status.querySelector(".k-status__extra");
      expect(extra()?.lastElementChild?.contains(more())).toBe(true);
      expect(extra()?.querySelector('[data-region="view-switch"]')).not.toBeNull();
      // one layer: no Layer switch and no row for it; the toolbar is the same
      rerender(<StageTop {...props({ trays: ONE_LAYER })} />);
      expect(rows().row).toBeNull();
      expect(extra()?.querySelector('[data-region="view-switch"]')).not.toBeNull();
    });

    it("shows Stop on the heading's line while it runs, and leaves the switches alone", () => {
      const { rerender } = render(<StageTop {...props()} />);
      const view = rows().status.querySelector('[data-region="view-switch"]');
      rerender(
        <StageTop {...props({ run: { status: "running", kind: "improve", done: 1, total: 4 } })} />,
      );
      const stop = screen.getByRole("button", { name: "Stop" });
      expect(rows().status.querySelector(".k-status__head")?.contains(stop)).toBe(true);
      expect(rows().row?.contains(stop)).toBe(false);
      expect(rows().status.querySelector('[data-region="view-switch"]')).toBe(view);
    });

    it("has no switches row without a plan", () => {
      render(<StageTop {...props({ trays: undefined })} />);
      expect(document.querySelector(".stage-segs")).toBeNull();
      expect(document.querySelector(".stage-controls")).toBeNull();
    });
  });

  describe("the View switch", () => {
    it("is Top and 3D, one pressed", () => {
      const p = props();
      render(<StageTop {...p} />);
      const group = screen.getByRole("group", { name: "View" });
      expect(within(group).getByRole("button", { name: "Top" }).getAttribute("aria-pressed")).toBe(
        "true",
      );
      fireEvent.click(within(group).getByRole("button", { name: "3D" }));
      expect(p.onViewChange).toHaveBeenCalledWith("3d");
      expect(screen.queryByText(/WebGL turned on/)).toBeNull();
    });

    it("blocks 3D without WebGL, says why, and says so under the row", () => {
      const p = props({ webgl: false });
      render(<StageTop {...p} />);
      const threeD = screen.getByRole("button", { name: "3D" });
      expect(threeD.getAttribute("aria-disabled")).toBe("true");
      expect(threeD.getAttribute("title")).toBe("3D needs WebGL");
      fireEvent.click(threeD);
      expect(p.onViewChange).not.toHaveBeenCalled();
      expect(
        screen.getByText("3D needs a browser with WebGL turned on. The top view works the same."),
      ).toBeTruthy();
    });
  });

  describe("on a phone", () => {
    it("puts the switches in their own row, 3D as a toggle button", () => {
      const p = props({ phone: true, view: "3d" });
      const { container } = render(<StageTop {...p} />);
      const row = container.querySelector(".stage-segs") as HTMLElement;
      expect(row).not.toBeNull();
      expect(row.classList.contains("stage-segs--phone")).toBe(true);
      // the heading is above it, not beside it
      expect(row.closest(".k-status")).toBeNull();
      const layer = within(row).getByRole("group", { name: "Layer" });
      expect(layer.className).toContain("k-seg--stretch");
      expect(
        within(layer)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Layer 1", "Layer 2", "All"]);
      expect(within(row).queryByRole("group", { name: "View" })).toBeNull();
      const toggle = within(row).getByRole("button", { name: "3D" });
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(toggle);
      expect(p.onViewChange).toHaveBeenCalledWith("plan");
    });

    it("keeps the ⋯ menu beside the heading, with Try another arrangement in it", () => {
      const p = props({ phone: true });
      const { container } = render(<StageTop {...p} />);
      expect(more().closest(".k-status")).not.toBeNull();
      expect(container.querySelector(".stage-segs")?.contains(more())).toBe(false);
      tryAnother();
      expect(p.onKeepSearching).toHaveBeenCalledTimes(1);
    });

    it("blocks the 3D toggle without WebGL", () => {
      const p = props({ phone: true, webgl: false });
      render(<StageTop {...p} />);
      const toggle = screen.getByRole("button", { name: "3D" });
      expect(toggle.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(toggle);
      expect(p.onViewChange).not.toHaveBeenCalled();
    });
  });
});

describe("shortfallSentence", () => {
  it("names the largest axis, rounded up to 0.1 mm", () => {
    expect(shortfallSentence({ x: 0, y: 0, z: 17.2 })).toBe(
      "The closest plan is 17.2 mm too tall.",
    );
    expect(shortfallSentence({ x: 3.01, y: 0, z: 0 })).toBe("The closest plan is 3.1 mm too wide.");
    expect(shortfallSentence({ x: 0, y: 8, z: 0 })).toBe("The closest plan is 8.0 mm too long.");
  });

  it("joins the axes that are short, the largest first", () => {
    expect(shortfallSentence({ x: 3, y: 0, z: 17.2 })).toBe(
      "The closest plan is 17.2 mm too tall and 3.0 mm too wide.",
    );
    expect(shortfallSentence({ x: 3, y: 9, z: 17.2 })).toBe(
      "The closest plan is 17.2 mm too tall, 9.0 mm too long and 3.0 mm too wide.",
    );
  });

  it("is empty when no axis is short, or there is no figure", () => {
    expect(shortfallSentence({ x: 0, y: 0, z: 0 })).toBe("");
    expect(shortfallSentence(null)).toBe("");
    expect(shortfallSentence(undefined)).toBe("");
  });
});

describe("statusOf, the fit problems", () => {
  const misfit = { componentId: "c1", trayKey: "t1", name: "Boards", reason: "box" as const };
  const noFit = (over: Partial<StatusInput> = {}) =>
    statusOf(input({ fits: null, noFit: { misfit }, ...over }));

  it("names the tray that does not fit, in a warn heading, with Edit and Try another arrangement to offer", () => {
    expect(noFit()).toEqual({
      tone: "warn",
      fit: "noFit",
      title: "The Boards tray doesn't fit yet",
      line: "There's no room left for it in the box.",
      actions: [
        { kind: "show", id: "c1", label: "Edit Boards" },
        { kind: "keep", label: "Try another arrangement" },
      ],
    });
  });

  it("speaks for a box that is too small in its line, naming no tray", () => {
    const volume = {
      verdict: "over" as const,
      line: "Your items need at least 7.2 L as trays. The box has 6.8 L under the headroom.",
      judgement: "This can't fit: take something out or reserve less space on top.",
      biggest: [],
      leaveOut: null,
    };
    expect(noFit({ noFit: { misfit: null, shortfall: { x: 0, y: 0, z: 17.2 }, volume } })).toEqual({
      tone: "warn",
      fit: "noFit",
      title: "Not everything fits yet",
      line: `${volume.line} ${volume.judgement}`,
      actions: [{ kind: "keep", label: "Try another arrangement" }],
    });
    // a tight box says nothing here: the note under the cards does
    expect(noFit({ noFit: { misfit, volume: { ...volume, verdict: "tight" } } }).line).toBe(
      "There's no room left for it in the box.",
    );
  });

  it("adds the closest plan's shortfall to the box reason, and not to the bed's", () => {
    const shortfall = { x: 0, y: 0, z: 17.2 };
    expect(noFit({ noFit: { misfit, shortfall } }).line).toBe(
      "There's no room left for it in the box. The closest plan is 17.2 mm too tall.",
    );
    expect(noFit({ noFit: { misfit: { ...misfit, reason: "bed" }, shortfall } }).line).toBe(
      "It's too big for your printer's bed.",
    );
    expect(noFit({ noFit: { misfit, shortfall: null } }).line).toBe(
      "There's no room left for it in the box.",
    );
  });

  it("says a tray is too big for the printer's bed when that is the reason", () => {
    const s = noFit({ noFit: { misfit: { ...misfit, reason: "bed" } } });
    expect(s.title).toBe("The Boards tray doesn't fit yet");
    expect(s.line).toBe("It's too big for your printer's bed.");
  });

  it("says Not everything fits yet when no tray stands out, and offers no edit", () => {
    const s = noFit({ noFit: { misfit: null } });
    expect(s.title).toBe("Not everything fits yet");
    expect(s.line).toBeUndefined();
    expect(s.actions).toEqual([{ kind: "keep", label: "Try another arrangement" }]);
  });

  it("offers no Try another arrangement when the plan is from older geometry", () => {
    expect(noFit({ canSearchMore: false }).actions).toEqual([
      { kind: "show", id: "c1", label: "Edit Boards" },
    ]);
  });

  it("works without a plan behind it", () => {
    expect(noFit({ hasLayout: false }).actions[0]).toEqual({
      kind: "show",
      id: "c1",
      label: "Edit Boards",
    });
  });

  const conflicts: LockConflict[] = [
    { trayKey: "a", kind: "position", name: "Boards", reason: "it is too big for its spot" },
    { trayKey: "b", kind: "stack", name: "Deck and Tokens", reason: "they need a taller box" },
  ];

  it("names the first conflict, gives the engine's reasons as sentences, one Unpin per conflict", () => {
    const s = statusOf(input({ fits: null, conflicts }));
    expect(s).toMatchObject({
      tone: "warn",
      fit: "pins",
      title: "Boards doesn't fit with your pins",
      line: "It is too big for its spot. They need a taller box.",
    });
    expect(s.list).toBeUndefined();
    expect(s.actions).toEqual([
      { kind: "unpin", conflict: conflicts[0], label: "Unpin Boards" },
      { kind: "unpin", conflict: conflicts[1], label: "Unpin Deck and Tokens" },
    ]);
  });

  it("says a reason once, however many pins share it, and keeps its full stop", () => {
    const same = [
      {
        trayKey: "a",
        kind: "position" as const,
        name: "A",
        reason: "the pins together leave no layout that fits",
      },
      {
        trayKey: "b",
        kind: "position" as const,
        name: "B",
        reason: "the pins together leave no layout that fits",
      },
      { trayKey: "c", kind: "position" as const, name: "C", reason: "it ends already." },
    ];
    expect(conflictLine(same)).toBe(
      "The pins together leave no layout that fits. It ends already.",
    );
    expect(conflictLine([])).toBe("");
  });

  it("tells a size lock from a pin of the same tray", () => {
    const s = statusOf(
      input({
        fits: null,
        conflicts: [
          { trayKey: "a", kind: "size", name: "Boards", reason: "y" },
          { trayKey: "a", kind: "position", name: "Boards", reason: "x" },
        ],
      }),
    );
    expect(s.title).toBe("Boards doesn't fit with its size locked");
    expect(s.actions.map((a) => (a.kind === "unpin" ? a.label : a.kind))).toEqual([
      "Unlock size of Boards",
      "Unpin Boards",
    ]);
  });

  it("words a turn that is in the way as its own, with Let <name> turn as its action", () => {
    const turn: LockConflict = {
      trayKey: "a",
      kind: "turn",
      name: "Market deck",
      reason: "it can't stay turned in its spot",
    };
    const s = statusOf(input({ fits: null, conflicts: [turn] }));
    expect(s).toMatchObject({
      tone: "warn",
      fit: "pins",
      title: "Market deck doesn't fit the way it is turned",
      line: "It can't stay turned in its spot.",
    });
    expect(s.actions).toEqual([{ kind: "unpin", conflict: turn, label: "Let Market deck turn" }]);
  });

  it("speaks before a no-fit, and has no Try another arrangement of its own", () => {
    const s = statusOf(input({ fits: null, conflicts, noFit: { misfit: null } }));
    expect(s.fit).toBe("pins");
    expect(s.actions.some((a) => a.kind === "keep")).toBe(false);
  });
});

describe("statusOf", () => {
  it("gives the tone, the words and the actions of each state", () => {
    expect(statusOf(input())).toMatchObject({ tone: "fit", title: "Everything fits" });
    expect(statusOf(input({ pending: true }))).toMatchObject({ tone: "info", actions: [] });
    expect(statusOf(input({ fits: null, hasLayout: false }))).toMatchObject({
      tone: "neutral",
      title: "No plan yet",
    });
    expect(statusOf(input({ run: { status: "error", message: "x" } })).tone).toBe("error");
    expect(statusOf(input({ noFit: { misfit: null } })).tone).toBe("warn");
  });

  it("lets a running search come before everything else", () => {
    const s = statusOf(
      input({
        run: { status: "running", done: 1, total: 2, kind: "improve" },
        conflicts: [{ trayKey: "a", name: "A", reason: "x" }],
      }),
    );
    expect(s.title).toBe("Searching…");
  });
});

describe("problemAreas", () => {
  const components = [
    { id: "c1", name: "Market deck" },
    { id: "c2", name: "" },
  ] as never;
  const error = (path: string) => ({ level: "error" as const, code: "x", message: "m", path });

  it("finds the editors, the box and Settings, once each, in the order of the errors", () => {
    expect(
      problemAreas(
        [
          error("/components/1/decks/0/count"),
          error("/box/innerWidth"),
          error("/components/1/name"),
          error("/printer/bedMargin"),
          error("/settings/wall"),
          { level: "warning", code: "w", message: "w", path: "/components/0" },
          error("/locks/0"),
          error("/components/9"),
        ],
        components,
      ),
    ).toEqual([
      { id: "c2", label: "Edit (unnamed)" },
      { id: "box", label: "Change the box" },
      { id: "settings", label: "Settings" },
    ]);
  });
});

describe("PlanBanner", () => {
  const banner = (over: Partial<PlanBannerProps> = {}): PlanBannerProps => ({
    stale: false,
    geometryOld: false,
    onUpdate: vi.fn(),
    onReprint: vi.fn(),
    onKeepOld: vi.fn(),
    ...over,
  });

  it("is a live region and nothing else when there is no banner", () => {
    const { container } = render(<PlanBanner {...banner()} />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(container.querySelector(".k-notice")).toBeNull();
  });

  it("speaks the older-geometry words from a region that was already there", () => {
    const p = banner();
    const view = render(<PlanBanner {...p} />);
    const live = screen.getByRole("status");
    expect(live.textContent).toBe("");
    view.rerender(<PlanBanner {...banner({ geometryOld: true })} />);
    expect(screen.getByRole("status")).toBe(live);
    expect(live.textContent).toBe(GEOMETRY_OLD_MESSAGE);
  });

  it("asks to make a new plan for a stale one, in the info tone", () => {
    const p = banner({ stale: true });
    const { container } = render(<PlanBanner {...p} />);
    const box = container.querySelector(".k-notice") as HTMLElement;
    expect(box.getAttribute("data-tone")).toBe("info");
    expect(box.textContent).toContain("This plan is from before your last changes.");
    expect(box.textContent).toContain("Download is off until it is updated.");
    fireEvent.click(screen.getByRole("button", { name: "Make a new plan" }));
    expect(p.onUpdate).toHaveBeenCalledTimes(1);
    // the box is not live itself: the region beside it says it
    expect(box.getAttribute("role")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "This plan is from before your last changes. Download is off until it is updated.",
    );
  });

  it("warns of an older version, with Reprint everything and Use the old plan", () => {
    const p = banner({ geometryOld: true });
    const { container } = render(<PlanBanner {...p} />);
    const box = container.querySelector(".k-notice") as HTMLElement;
    expect(box.getAttribute("data-tone")).toBe("warn");
    expect(box.textContent).toContain(GEOMETRY_OLD_MESSAGE);
    expect(box.querySelector("strong")?.textContent).toBe("Made with an older version of the app.");
    expect(screen.getByRole("status").textContent).toBe(GEOMETRY_OLD_MESSAGE);
    fireEvent.click(screen.getByRole("button", { name: "Reprint everything" }));
    expect(p.onReprint).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Use the old plan" }));
    expect(p.onKeepOld).toHaveBeenCalledTimes(1);
  });
});
