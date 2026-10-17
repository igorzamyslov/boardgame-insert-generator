// src/screens/RunAnnouncer.tsx
import { useEffect, useState } from "preact/hooks";
import { MAKING_PLAN_MESSAGE, SEARCHING_MESSAGE } from "../app/state";
import type { RunState } from "../app/state";

/** A new plan after an edit shorter than this is not announced: it is routine, like saving. */
export const SLOW_RUN_MS = 1000;

/** The run worth announcing: a "Keep searching" (the person asked), or a new plan that is slow. */
type Spoken = "search" | "plan" | null;

/**
 * What the screen reader hears: only the start and the end of a run, never the percent (it would
 * be read out at every step).
 */
function liveText(run: RunState, spoken: Spoken): string {
  if (run.status === "running") {
    // only the words that fit this run: a leftover from the one before says nothing
    if (run.kind === "improve") {
      return spoken === "search" ? SEARCHING_MESSAGE : "";
    }
    return spoken === "plan" ? MAKING_PLAN_MESSAGE : "";
  }
  if (run.status === "done" && spoken !== null) {
    return spoken === "search" ? "Search finished." : "Plan updated.";
  }
  return "";
}

/**
 * The run's visually hidden live region, beside the status heading (the Summary's, moved). It is
 * always mounted, empty until there is something to say: a region that appears together with its
 * text is often not read (DEVELOPMENT, "MUST mount a live region").
 */
export function RunAnnouncer({ run }: { run: RunState }) {
  const running = run.status === "running";
  const improving = run.status === "running" && run.kind === "improve";
  const [spoken, setSpoken] = useState<Spoken>(null);
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    if (improving) {
      setSpoken("search");
      return undefined;
    }
    setSpoken(null);
    const timer = setTimeout(() => setSpoken("plan"), SLOW_RUN_MS);
    return () => clearTimeout(timer);
  }, [running, improving]);
  return (
    <p class="visually-hidden" role="status" data-live="run">
      {liveText(run, spoken)}
    </p>
  );
}
