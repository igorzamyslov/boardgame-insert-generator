// src/screens/FitProblem.tsx
// The stage when the plan does not fit (UI rebuild Task 12): NoFit's, for a search that found no
// layout, and PinConflict's, for pins that block one. The heading is the page's h1 in the warn
// tone; under it the plan as a picture (the closest attempt dimmed with the tray that overhangs
// marked, or the plan the runner kept with its pins) and a panel of what the engine can do about
// it: Edit the tray and Try another arrangement, or Unpin / Unlock size per conflict. No outcome
// is promised and no figure invented (DESIGN §6: trial runs are Phase 3). On a phone the same
// cards are the peek sheet's (MobileFix), and the stage holds the heading and the picture.
import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { StatusHeading } from "../kit";
import type { Box, Component, Group, ReservedSpec, Settings, TraySpec } from "../model/types";
import { levelsOf } from "../plan/layers";
import { PlanView } from "../plan/PlanView";
import type { VolumeNote } from "../ui/volumeFit";
import type { Status, StatusAction } from "./StageTop";
import "./fitProblem.css";

/** Which fit problem: NoFit's, or PinConflict's. */
export type FitKind = "noFit" | "pinConflict";

/** A status' fit kind (`Status.fit`) as this screen names it. */
export const fitKindOf = (fit: NonNullable<Status["fit"]>): FitKind =>
  fit === "noFit" ? "noFit" : "pinConflict";

/** The panel's title (NoFit and MobileFix; PinConflict's column): also the phone sheet's handle. */
export const fitTitle = (kind: FitKind): string =>
  kind === "noFit" ? "Ways to make it fit" : "Unpin one";

interface Fixes {
  /** Opens a component's editor. */
  onShow: (id: string) => void;
  onKeepSearching: () => void;
  onUnpin: (conflict: Extract<StatusAction, { kind: "unpin" }>["conflict"]) => void;
}

export interface FitCardsProps extends Fixes {
  kind: FitKind;
  /** The status' actions, each a card in this order. */
  actions: readonly StatusAction[];
  /** NoFit: what the items need against the box, under the cards. */
  volume?: VolumeNote | null;
}

/** One thing to do, as a card: its words alone (no outcome: the engine has no way to say one). */
function Card(p: { lead: boolean; first: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class={p.lead ? "fp-card fp-card--lead" : "fp-card"}
      // where the focus goes when a run has ended with this problem (App)
      data-fit-first={p.first ? "" : undefined}
      onClick={p.onClick}
    >
      {p.label}
    </button>
  );
}

/**
 * The volume note under NoFit's cards: the figures and the judgement (over the box's volume, the
 * heading has them), the biggest items, and the one item whose leaving out would do.
 */
function Volume(p: { note: VolumeNote }) {
  const { note } = p;
  const over = note.verdict === "over";
  return (
    <div class="fp-volume" data-verdict={note.verdict}>
      {over ? null : (
        // one paragraph, so the judgement stays in view with the figures in a phone's peek
        <p class="fp-volume__line">
          {note.line}
          {note.judgement === null ? null : (
            <>
              {" "}
              <strong class="fp-volume__judgement">{note.judgement}</strong>
            </>
          )}
        </p>
      )}
      {note.biggest.length === 0 ? null : (
        <ul class="fp-volume__list">
          {note.biggest.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {note.leaveOut === null ? null : <p class="fp-volume__line">{note.leaveOut}</p>}
    </div>
  );
}

/**
 * The cards of a fit problem (the header's Undo is the way back; PinConflict's own is not built). NoFit's first card has the
 * ink edge (its recommended one on the board); the pins' cards are equals, since nothing here
 * knows which unpin helps.
 */
export function FitCards(p: FitCardsProps) {
  const noFit = p.kind === "noFit";
  return (
    <div class="fp-cards" data-kind={p.kind}>
      {p.actions.map((a, i) => {
        switch (a.kind) {
          case "show":
            return (
              <Card
                key={`show|${a.id}`}
                lead={noFit && i === 0}
                first={i === 0}
                label={a.label}
                onClick={() => p.onShow(a.id)}
              />
            );
          case "keep":
            return (
              <Card
                key="keep"
                lead={noFit && i === 0}
                first={i === 0}
                label={a.label}
                onClick={p.onKeepSearching}
              />
            );
          case "unpin":
            return (
              <Card
                key={`unpin|${a.conflict.trayKey}|${a.conflict.kind ?? ""}`}
                lead={false}
                first={i === 0}
                label={a.label}
                onClick={() => p.onUnpin(a.conflict)}
              />
            );
          default:
            return null;
        }
      })}
      {noFit && p.volume ? <Volume note={p.volume} /> : null}
    </div>
  );
}

export interface FitProblemProps extends FitCardsProps {
  /** The status (`statusOf`): the heading's tone, words and line. */
  status: Status;
  /** What the picture draws: the closest attempt (NoFit) or the plan that was kept (PinConflict); null: nothing to draw. */
  trays: readonly TraySpec[] | null;
  /** Where the plan put the area kept free on top; the plan view outlines it. */
  reserved?: readonly ReservedSpec[];
  box: Box;
  settings: Settings;
  components: readonly Component[];
  /** The project's groups: a group's trays are drawn neutral and called by its name. */
  groups?: readonly Group[];
  /** Position pins, for the badges and what stays whole (the pins' picture). */
  lockedKeys: ReadonlySet<string>;
  /** The tray that does not fit, marked on the picture (NoFit). */
  misfitKey?: string | null;
  /** The tray whose layer the picture shows (the culprit's, or the first conflict's); the bottom layer without one. */
  focusKey?: string | null;
  /** Below 760 px: the cards are the sheet's (`FitCards` there), and the stage has the heading and the picture. */
  phone: boolean;
  /** The layout and sizing notices: under the panel beside the picture, under the picture on a phone. */
  after?: ComponentChildren;
}

const nothing = (): void => undefined;
const NONE: ReadonlySet<string> = new Set<string>();

/** The stage of a fit problem: the heading, the picture and, beside it, the panel (a desktop's). */
export function FitProblem(p: FitProblemProps) {
  const panelId = useId();
  const noFit = p.kind === "noFit";
  const trays = p.trays ?? [];
  // The picture shows the layer the problem is on: the culprit's, or the bottom one.
  const levels = levelsOf(trays);
  const focused = p.focusKey === undefined ? undefined : trays.find((t) => t.key === p.focusKey);
  const level = focused === undefined ? 0 : Math.max(0, levels.indexOf(focused.level));
  return (
    <>
      <div data-region="status" class="fp-status">
        <StatusHeading tone="warn" title={p.status.title} line={p.status.line} />
      </div>
      <div class="fp-body" data-kind={p.kind}>
        <section class="fp-draw" aria-label="Preview" data-region="plan">
          {p.trays === null ? null : (
            <PlanView
              readOnly
              dim={noFit ? "all" : "unpinned"}
              misfitKey={noFit ? (p.misfitKey ?? null) : null}
              trays={p.trays}
              reserved={p.reserved}
              box={p.box}
              settings={p.settings}
              components={p.components}
              groups={p.groups}
              lockedKeys={noFit ? NONE : p.lockedKeys}
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
        {p.phone || (p.actions.length === 0 && !p.volume && p.after === undefined) ? null : (
          // beside the picture, under the panel: the notices have room there, and the stage keeps its height
          <div class="fp-side" data-kind={p.kind}>
            {p.actions.length === 0 && !p.volume ? null : (
              <section
                class="fp-panel"
                data-kind={p.kind}
                data-region="options"
                aria-labelledby={panelId}
              >
                <h2 class="fp-title" id={panelId}>
                  {fitTitle(p.kind)}
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
