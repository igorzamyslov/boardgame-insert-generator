// src/screens/BoxStage.tsx
// The stage while the box's editor is open (Box): the side view of the box in the middle, its label
// over it as the page's one h1, and its caption under it. A failed run, a tray that does not fit or
// pins in the way are told in a line at the top (an alert, not a heading), in the status heading's
// words, as the component editor does. On a phone the sheet has the h1 and the side view, and the
// stage shows the plan alone.
import type { ComponentChildren } from "preact";
import { PlanView } from "../plan/PlanView";
import type { PlanViewProps } from "../plan/PlanView";
import type { Box, Component, Settings, StoredLayout } from "../model/types";
import { BoxSideView } from "./BoxSideView";
import { ProblemLine } from "./EditorStage";
import type { EditorProblem } from "./StageTop";
import "./boxStage.css";

export interface BoxStageProps {
  box: Box;
  settings: Settings;
  layout: StoredLayout | undefined;
  components: readonly Component[];
  /** Below 760 px: the sheet has the h1 and the side view; the stage is the plan alone. */
  phone?: boolean;
  /** The plan, as the workspace draws it; null while there is none (the placeholder takes its place). */
  plan: Omit<
    PlanViewProps,
    "bar" | "editedId" | "level" | "onLevelChange" | "selectedKey" | "onSelect"
  > | null;
  /** What stands where the plan would be while there is none (a phone's stage). */
  placeholder?: ComponentChildren;
  /** Under the picture: the layout and sizing notices. */
  after?: ComponentChildren;
  /** What the plan's status says that the editor must not lose (null: nothing). */
  problem?: EditorProblem | null;
  onRetry?: () => void;
}

const nothing = (): void => undefined;

/** The stage of the box's editor. */
export function BoxStage({
  box,
  settings,
  layout,
  components,
  phone = false,
  plan,
  placeholder,
  after,
  problem,
  onRetry,
}: BoxStageProps) {
  if (phone) {
    return (
      <section class="plan-col" aria-label="Preview" data-region="plan">
        {plan === null ? (
          placeholder
        ) : (
          <PlanView
            {...plan}
            level={0}
            onLevelChange={nothing}
            selectedKey={null}
            onSelect={nothing}
          />
        )}
        {after}
      </section>
    );
  }
  return (
    <div class="bx-stage">
      {problem ? <ProblemLine problem={problem} onRetry={onRetry} /> : null}
      <div class="bx-stage__body">
        <h1 class="bx-label">Side view of the box</h1>
        <BoxSideView box={box} settings={settings} layout={layout} components={components} />
      </div>
      {after}
    </div>
  );
}
