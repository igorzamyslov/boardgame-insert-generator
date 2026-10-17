// src/screens/RunAnnouncer.test.tsx
// @vitest-environment jsdom
// The Summary's run announcer, moved (UI rebuild Task 6): the same words and the same 1 s rule.
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunState } from "../app/state";
import { RunAnnouncer, SLOW_RUN_MS } from "./RunAnnouncer";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const running = (kind?: "edit" | "improve", done = 250): RunState => ({
  status: "running",
  done,
  total: 1000,
  kind,
});

/** The run's own region. */
const liveRegion = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>("[data-live='run']");
  if (el === null) {
    throw new Error("the run's live region is not on the page");
  }
  return el;
};

describe("RunAnnouncer", () => {
  it("is there from the start, empty and out of sight, so a reader hears the words arrive", () => {
    const view = render(<RunAnnouncer run={{ status: "idle" }} />);
    const live = liveRegion();
    expect(live.textContent).toBe("");
    expect(live.getAttribute("role")).toBe("status");
    expect(live.classList.contains("visually-hidden")).toBe(true);
    view.rerender(<RunAnnouncer run={running("improve")} />);
    expect(liveRegion()).toBe(live);
  });

  it("announces Keep searching at the start and at the end, never the percent", () => {
    const view = render(<RunAnnouncer run={{ status: "idle" }} />);
    const live = liveRegion();
    view.rerender(<RunAnnouncer run={running("improve")} />);
    expect(live.textContent).toBe("Searching…");
    expect(live.textContent).not.toMatch(/%/);
    view.rerender(<RunAnnouncer run={running("improve", 500)} />);
    expect(live.textContent).toBe("Searching…");
    view.rerender(<RunAnnouncer run={{ status: "done" }} />);
    expect(live.textContent).toBe("Search finished.");
  });

  it("keeps quiet about a new plan that takes under a second, like saving", () => {
    vi.useFakeTimers();
    const view = render(<RunAnnouncer run={{ status: "idle" }} />);
    const live = liveRegion();
    view.rerender(<RunAnnouncer run={running("edit")} />);
    act(() => {
      vi.advanceTimersByTime(SLOW_RUN_MS - 100);
    });
    expect(live.textContent).toBe("");
    view.rerender(<RunAnnouncer run={{ status: "done" }} />);
    act(() => {
      vi.advanceTimersByTime(SLOW_RUN_MS);
    });
    expect(live.textContent).toBe("");
  });

  it("announces a new plan that is slow, and when it is ready", () => {
    vi.useFakeTimers();
    const view = render(<RunAnnouncer run={{ status: "idle" }} />);
    const live = liveRegion();
    view.rerender(<RunAnnouncer run={running("edit")} />);
    act(() => {
      vi.advanceTimersByTime(SLOW_RUN_MS + 10);
    });
    expect(live.textContent).toBe("Making a new plan…");
    view.rerender(<RunAnnouncer run={{ status: "done" }} />);
    expect(live.textContent).toBe("Plan updated.");
  });
});
