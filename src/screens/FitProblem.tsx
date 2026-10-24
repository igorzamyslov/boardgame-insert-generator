// src/screens/FitProblem.tsx
// The stage when pins keep a plan from fitting (UI rebuild Task 12: PinConflict, and MobileFix on a
// phone). The heading is the page's h1 in the warn tone; under it the plan the runner kept, the
// pinned trays whole and the rest dimmed, and a column of what the engine can do about it: Unpin
// or Unlock size per conflict. No outcome is promised and no figure invented (DESIGN §6: trial
// runs are Phase 3). On a phone the same cards are the peek sheet's, and the stage holds the
// heading and the picture. A tray that does not fit is not here: no fit is the normal stage with
// the problem strip over it (`FitStrip`, board 6 of the 2026-10-23 review).
import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { StatusHeading } from "../kit";
import type { Box, Component, Group, ReservedSpec, Settings, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { PlanView } from "../plan/PlanView";
import type { Status, StatusAction } from "./StageTop";
import "./fitProblem.css";

/** Which fit problem: no fit (the strip over the normal stage), or the pins' (this screen). */
export type FitKind = "noFit" | "pinConflict";

/** A status' fit kind (`Status.fit`) as this screen names it. */
export const fitKindOf = (fit: NonNullable<Status["fit"]>): FitKind =>
  fit === "noFit" ? "noFit" : "pinConflict";

/** The column's title: also the phone sheet's handle. */
export const FIT_TITLE = "Unpin one";

export interface FitCardsProps {
  /** The status' actions, each a card in this order. */
  actions: readonly StatusAction[];
  onUnpin: (conflict: Extract<StatusAction, { kind: "unpin" }>["conflict"]) => void;
}

/** One thing to do, as a card: its words alone (no outcome: the engine has no way to say one). */
function Card(p: { first: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class="fp-card"
      // where the focus goes when a run has ended with this problem (App)
      data-fit-first={p.first ? "" : undefined}
      onClick={p.onClick}
    >
      {p.label}
    </button>
  );
}

/**
 * The cards of the pins' problem (the header's Undo is the way back; PinConflict's own is not
 * built): the cards are equals, since nothing here knows which unpin helps.
 */
export function FitCards(p: FitCardsProps) {
  return (
    <div class="fp-cards">
      {p.actions.map((a, i) =>
        a.kind === "unpin" ? (
          <Card
            key={`unpin|${a.conflict.trayKey}|${a.conflict.kind ?? ""}`}
            first={i === 0}
            label={a.label}
            onClick={() => p.onUnpin(a.conflict)}
          />
        ) : null,
      )}
    </div>
  );
}

export interface FitProblemProps extends FitCardsProps {
  /** The status (`statusOf`): the heading's tone, words and line. */
  status: Status;
  /** What the picture draws: the plan the runner kept; null: nothing to draw. */
  trays: readonly TraySpec[] | null;
  /** Where the plan put the area kept free on top; the plan view outlines it. */
  reserved?: readonly ReservedSpec[];
  box: Box;
  settings: Settings;
  components: readonly Component[];
  /** The project's groups: a group's trays are drawn neutral and called by its name. */
  groups?: readonly Group[];
  /** Position pins, for the badges and what stays whole. */
  lockedKeys: ReadonlySet<string>;
  /** The tray whose layer the picture shows (the first conflict's); the bottom layer without one. */
  focusKey?: string | null;
  /** Below 760 px: the cards are the sheet's (`FitCards` there), and the stage has the heading and the picture. */
  phone: boolean;
  /** The layout and sizing notices: under the column beside the picture, under the picture on a phone. */
  after?: ComponentChildren;
}

const nothing = (): void => undefined;
const NONE: ReadonlySet<string> = new Set<string>();

/** The stage of the pins' problem: the heading, the picture and, beside it, the column (a desktop's). */
export function FitProblem(p: FitProblemProps) {
  const panelId = useId();
  const trays = p.trays ?? [];
  // The picture shows the layer the problem is on: the first conflict's, or the bottom one.
  const levels = levelsOf(trays);
  const focused = p.focusKey === undefined ? undefined : trays.find((t) => t.key === p.focusKey);
  const level = focused === undefined ? 0 : Math.max(0, levels.indexOf(focused.level));
  return (
    <>
      <div data-region="status" class="fp-status">
        <StatusHeading tone="warn" title={p.status.title} line={p.status.line} />
      </div>
      <div class="fp-body" data-kind="pinConflict">
        <section class="fp-draw" aria-label="Preview" data-region="plan">
          {p.trays === null ? null : (
            <PlanView
              readOnly
              dim="unpinned"
              trays={p.trays}
              reserved={p.reserved}
              box={p.box}
              settings={p.settings}
              components={p.components}
              groups={p.groups}
              lockedKeys={p.lockedKeys}
              sizeLockedKeys={NONE}
              selectedKey={null}
              onSelect={nothing}
              onSwap={nothing}
              level={level}
              onLevelChange={nothing}
              swapFrom={null}
              onSwapFromChange={nothing}
            />
          )}
        </section>
        {p.phone || (p.actions.length === 0 && p.after === undefined) ? null : (
          // beside the picture: the notices have room there, and the stage keeps its height
          <div class="fp-side" data-kind="pinConflict">
            {p.actions.length === 0 ? null : (
              <section
                class="fp-panel"
                data-kind="pinConflict"
                data-region="options"
                aria-labelledby={panelId}
              >
                <h2 class="fp-title" id={panelId}>
                  {FIT_TITLE}
                </h2>
                <FitCards {...p} />
              </section>
            )}
            {p.after}
          </div>
        )}
      </div>
      {p.phone ? p.after : null}
    </>
  );
}
