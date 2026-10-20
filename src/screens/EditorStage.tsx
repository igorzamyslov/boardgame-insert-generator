// src/screens/EditorStage.tsx
// The stage while a component is being edited (Edit): the slot above the box holds the sentence
// that says which tray this is (the page's one h1) or, for a few seconds after an option changed,
// the note about it; the edited component's trays are lifted and the rest dimmed. On a phone the
// sheet's name is the h1, and the strip under its header shows the same two things.
import type { ComponentChildren } from "preact";
import { Fragment } from "preact";
import { useState } from "preact/hooks";
import { Button, Segmented, Toast } from "../kit";
import type { Box, Component, Group, Settings, TraySpec } from "../model/types";
import { growthOf } from "../model/defaults";
import { parseTrayKey } from "../model/groups";
import { planFrame, toSvgRect, traysAt } from "../plan/layers";
import { levelsOf } from "../plan/layers";
import { lookOfTray } from "../plan/glyph";
import { PlanView } from "../plan/PlanView";
import type { PlanViewProps } from "../plan/PlanView";
import { componentIndexesOfTray, mm } from "../ui/identity";
import { layerOptions } from "./StageTop";
import type { EditorProblem } from "./StageTop";
import { useNoteClock } from "../kit/Toast";
import "./editorStage.css";

/** A note about an option change: its words, and a number that changes with each one. */
export interface EditNote {
  text: string;
  id: number;
}

/** What the plan says of the component's trays: how many, and the first one's size. */
export interface TrayFacts {
  count: number;
  /** The first tray's footprint in mm, when the plan has one. */
  size: { w: number; d: number } | null;
}

/**
 * The trays of the component in the plan (the stored trays, not the spacers and risers made for
 * printing): every tray it is in, a tray shared with the rest of its group included.
 */
export function traysOfComponent(
  trays: readonly TraySpec[],
  components: readonly Component[],
  componentId: string,
): TraySpec[] {
  const index = components.findIndex((c) => c.id === componentId);
  return index === -1
    ? []
    : trays.filter(
        (t) => t.part === "tray" && componentIndexesOfTray(t, components).includes(index),
      );
}

/** The words a sentence adds when a copy was cut into several trays (spec §7.4, §8). */
export const SPLIT_SENTENCE = " Too big for one tray, so it is split.";

/**
 * Whether a copy of these trays is printed as several: two trays with one key but for the part
 * ("Player kit 2a", "Player kit 2b"). Several copies of one tray each are not a split.
 */
export function hasSplitCopy(trays: readonly TraySpec[]): boolean {
  const seen = new Set<string>();
  for (const t of trays) {
    const at = parseTrayKey(t.key);
    if (at === undefined) {
      continue;
    }
    const copy = `${at.stem}:${at.copy}`;
    if (seen.has(copy)) {
      return true;
    }
    seen.add(copy);
  }
  return false;
}

/**
 * "Market deck tray, 95 × 190 mm. It grows as you add cards." (Edit's sentence): the name in bold,
 * the first tray's footprint, and for a deck that leaves room to grow, that it does. Several trays:
 * "Starter decks, 4 trays." Without a plan yet, the name alone.
 */
export function StageSentence({
  component: c,
  trays,
  tag: Tag = "h1",
  hidden = false,
}: {
  component: Component;
  trays: readonly TraySpec[];
  tag?: "h1" | "p";
  /** Not drawn (the note is in its place), still on the page: the page always has its h1. */
  hidden?: boolean;
}) {
  const name = c.name === "" ? "(unnamed)" : c.name;
  const first = trays[0];
  const grows = c.kind === "cards" && growthOf(c, "stack", c.storage === "flat") !== "off";
  let rest = "";
  if (trays.length > 1) {
    rest = `, ${trays.length} trays.${hasSplitCopy(trays) ? SPLIT_SENTENCE : ""}`;
  } else if (first !== undefined) {
    rest = ` tray, ${mm(first.w)} × ${mm(first.d)} mm.${grows ? " It grows as you add cards." : ""}`;
  }
  return (
    <Tag class={hidden ? "ed-sentence visually-hidden" : "ed-sentence"}>
      <strong>{name}</strong>
      {rest === "" ? null : rest}
    </Tag>
  );
}

/**
 * A failed run, a tray that does not fit or pins in the way, told in the status heading's own
 * words while the heading is not drawn: an alert, not a heading, with Retry for a failed run.
 */
export function ProblemLine({
  problem,
  onRetry,
}: {
  problem: EditorProblem;
  onRetry?: () => void;
}) {
  return (
    <p class="ed-problem" role="alert" data-tone={problem.tone}>
      <strong>{problem.title}</strong>
      {problem.lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
      {problem.retry && onRetry !== undefined ? (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </p>
  );
}

export interface EditorStageProps {
  componentId: string;
  components: readonly Component[];
  /** The plan's trays as printed (the app's `printable`). */
  trays: readonly TraySpec[];
  note: EditNote | null;
  /** The note's time is up: the owner clears it. */
  onNoteDone: () => void;
  /** Below 760 px: the sheet has the h1, and the stage is the plan alone. */
  phone?: boolean;
  /** The plan, as the workspace draws it; null while there is none (the placeholder takes its place). */
  plan: Omit<
    PlanViewProps,
    "bar" | "editedId" | "level" | "onLevelChange" | "selectedKey" | "onSelect"
  > | null;
  /** What stands where the plan would be while there is none. */
  placeholder?: ComponentChildren;
  /** Under the plan: the layout and sizing notices. */
  after?: ComponentChildren;
  /** What the plan's status says that the editor must not lose (null: nothing). */
  problem?: EditorProblem | null;
  onRetry?: () => void;
}

const nothing = (): void => undefined;

/**
 * The slot's content: the sentence (the page's h1), or the note in its place. The note's region is
 * always on the page, so a reader hears it arrive.
 */
function Slot({
  component,
  trays,
  note,
  onNoteDone,
  problem,
  onRetry,
  layers,
}: {
  component: Component;
  trays: readonly TraySpec[];
  note: EditNote | null;
  onNoteDone: () => void;
  problem?: EditorProblem | null;
  onRetry?: () => void;
  /** The Layer switch, when the plan has two layers or more. */
  layers?: ComponentChildren;
}) {
  return (
    <div class="ed-slot" data-region="status">
      <div class="ed-slot__row">
        <Toast message={note?.text ?? null} nonce={note?.id} onDone={onNoteDone} />
        <StageSentence component={component} trays={trays} hidden={note !== null} />
        {layers}
      </div>
      {problem ? <ProblemLine problem={problem} onRetry={onRetry} /> : null}
    </div>
  );
}

/** The stage of the editor: the slot, the box with the component's trays lifted, and its caption. */
export function EditorStage({
  componentId,
  components,
  trays,
  note,
  onNoteDone,
  phone = false,
  plan,
  placeholder,
  after,
  problem,
  onRetry,
}: EditorStageProps) {
  // The layer the person picked, for this component only: another one opens on its own layer.
  const [picked, setPicked] = useState<{ id: string; layer: number } | null>(null);
  const component = components.find((c) => c.id === componentId);
  if (component === undefined) {
    return null;
  }
  const mine = traysOfComponent(trays, components, componentId);
  // The box opens on the layer of the component's first tray, so its lift is in sight; the Layer
  // switch moves it to see the others (the top view's: one layer at a time).
  const levels = levelsOf(trays);
  const home = mine[0] === undefined ? 0 : Math.max(0, levels.indexOf(mine[0].level));
  const chosen = picked !== null && picked.id === componentId ? picked.layer : null;
  const at = chosen !== null && chosen < levels.length ? chosen : home;
  const layers =
    levels.length > 1 ? (
      <Segmented
        label="Layer"
        tone="track"
        options={layerOptions(trays)}
        value={String(at)}
        onChange={(v) => setPicked({ id: componentId, layer: Number(v) })}
      />
    ) : undefined;
  const slot = phone ? undefined : (
    <Slot
      component={component}
      trays={mine}
      note={note}
      onNoteDone={onNoteDone}
      problem={problem}
      onRetry={onRetry}
      layers={layers}
    />
  );
  return (
    <section class="plan-col ed-stage" aria-label="Preview" data-region="plan">
      {plan === null ? (
        <>
          {slot === undefined ? null : <div class="stage-slot">{slot}</div>}
          {placeholder}
        </>
      ) : (
        <PlanView
          {...plan}
          bar={slot}
          editedId={componentId}
          level={at}
          onLevelChange={nothing}
          selectedKey={null}
          onSelect={nothing}
        />
      )}
      {after}
    </section>
  );
}

const STRIP_PX = 84;

/**
 * MobileEdit's strip under the sheet's header: the box drawn small with the component's trays in
 * full and the rest at half, and the sentence that says which tray this is (or the note). The
 * picture is for the eye only.
 */
export function EditorStrip({
  componentId,
  components,
  groups,
  trays,
  box,
  settings,
  note,
  onNoteDone,
  problem,
  onRetry,
}: {
  componentId: string;
  components: readonly Component[];
  /** The project's groups: a group's tray is drawn in its neutral colours. */
  groups?: readonly Group[];
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  note: EditNote | null;
  onNoteDone: () => void;
  problem?: EditorProblem | null;
  onRetry?: () => void;
}) {
  useNoteClock(note?.text ?? null, note?.id, onNoteDone);
  const component = components.find((c) => c.id === componentId);
  if (component === undefined) {
    return null;
  }
  const mine = traysOfComponent(trays, components, componentId);
  const levels = levelsOf(trays);
  const level = mine[0] === undefined ? (levels[0] ?? 0) : mine[0].level;
  const frame = planFrame(box, settings);
  const wide = frame.innerW >= frame.innerD;
  const pct = (v: number): string => `${Math.round(v * 10000) / 10000}%`;
  return (
    <div class="ed-strip">
      <div
        class="ed-strip__box"
        aria-hidden="true"
        style={{
          width: wide ? STRIP_PX : (STRIP_PX * frame.innerW) / frame.innerD,
          height: wide ? (STRIP_PX * frame.innerD) / frame.innerW : STRIP_PX,
        }}
      >
        {traysAt(trays, level).map((t) => {
          const r = toSvgRect(t, frame);
          const look = lookOfTray(t, components, groups);
          const edited = mine.some((m) => m.key === t.key);
          return (
            <Fragment key={t.key}>
              <span
                class="ed-strip__tray"
                data-edited={edited ? "" : undefined}
                style={{
                  left: pct(((frame.bc + r.x) / frame.innerW) * 100),
                  top: pct(((frame.bc + r.y) / frame.innerD) * 100),
                  width: pct((r.w / frame.innerW) * 100),
                  height: pct((r.h / frame.innerD) * 100),
                  ...(look === null
                    ? {}
                    : { "--tile-fill": look.shade.fill, "--tile-line": look.shade.line }),
                }}
              />
            </Fragment>
          );
        })}
      </div>
      <div>
        <div role="status">{note === null ? null : <p class="ed-strip__text">{note.text}</p>}</div>
        {note === null ? <StageSentence component={component} trays={mine} tag="p" /> : null}
        {problem ? <ProblemLine problem={problem} onRetry={onRetry} /> : null}
      </div>
    </div>
  );
}
