// src/screens/EditorStage.tsx
// The stage while a component is being edited (Edit), on the normal stage's own frame (WideStage2):
// where the status heading stood is the sentence that says which tray this is (the page's one h1)
// or, for a few seconds after an option changed, the note about it; under it the same Layer and
// Top / 3D switches; the tray bar's slot is an empty band; the box is drawn from above or in 3D with
// the edited component's trays lifted and the rest dimmed. On a phone the sheet's name is the h1,
// and the strip under its header shows the same two things.
import type { ComponentChildren } from "preact";
import { Fragment } from "preact";
import { useState } from "preact/hooks";
import { Button, Segmented, Toast } from "../kit";
import { parentKey } from "../instructions/numbering";
import type { Box, Component, Group, Settings, TraySpec } from "../model/types";
import { growthOf } from "../model/defaults";
import { DEFAULT_GROUP_NAME, groupById, groupOfItem, parseTrayKey } from "../model/groups";
import { planFrame, toSvgRect, traysAt } from "../plan/layers";
import { levelsOf } from "../plan/layers";
import { lookOfTray } from "../plan/glyph";
import { PlanView } from "../plan/PlanView";
import type { PlanViewProps } from "../plan/PlanView";
import { componentIndexesOfTray, mm, traysOfGroup } from "../ui/identity";
import { Viewer } from "../viewer/Viewer";
import type { ViewerProps } from "../viewer/Viewer";
import { StageSlot } from "./StageSlot";
import type { StageSlotProps } from "./StageSlot";
import { ViewSwitch, WebGlNote, layerOptions, layerValueOf } from "./StageTop";
import type { EditorProblem, StageView } from "./StageTop";
import { SETTLE_MS, useSettled } from "./useSettled";
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
 * The sentence: the name in bold, then what the plan says of the trays. One tray: "Market deck
 * tray, 95 × 190 mm." (and, for a deck that leaves room to grow, that it does). Several: "Starter
 * decks, 4 trays." (and, when a copy was cut into several, that it was). Without a plan yet, the
 * name alone.
 */
function Sentence({
  name,
  trays,
  grows = false,
  tag: Tag = "h1",
  hidden = false,
}: {
  name: string;
  trays: readonly TraySpec[];
  /** The one tray's deck leaves room to grow. */
  grows?: boolean;
  tag?: "h1" | "p";
  /** Not drawn (the note is in its place), still on the page: the page always has its h1. */
  hidden?: boolean;
}) {
  const first = trays[0];
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
 * "Market deck tray, 95 × 190 mm. It grows as you add cards." (Edit's sentence): the name in bold,
 * the first tray's footprint, and for a deck that leaves room to grow, that it does. Several trays:
 * "Starter decks, 4 trays." Without a plan yet, the name alone.
 */
export function StageSentence({
  component: c,
  trays,
  tag,
  hidden,
}: {
  component: Component;
  trays: readonly TraySpec[];
  tag?: "h1" | "p";
  hidden?: boolean;
}) {
  const grows = c.kind === "cards" && growthOf(c, "stack", c.storage === "flat") !== "off";
  return (
    <Sentence
      name={c.name === "" ? "(unnamed)" : c.name}
      trays={trays}
      grows={grows}
      tag={tag}
      hidden={hidden}
    />
  );
}

/** A group's sentence (G2): "Player kit, 4 trays.", with " Too big for one tray, so it is split." when a copy was cut. */
export function GroupSentence({
  group,
  trays,
  tag,
  hidden,
}: {
  group: Group;
  trays: readonly TraySpec[];
  tag?: "h1" | "p";
  hidden?: boolean;
}) {
  return (
    <Sentence
      name={group.name === "" ? DEFAULT_GROUP_NAME : group.name}
      trays={trays}
      tag={tag}
      hidden={hidden}
    />
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
  /** The item being edited. Without it, `groupId` names the group being edited. */
  componentId?: string;
  /** The group being edited (G2): its trays are lifted and its sentence is the h1. */
  groupId?: string;
  components: readonly Component[];
  /** The project's groups: a group's trays are told apart from an item's by their key. */
  groups?: readonly Group[];
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
    | "bar"
    | "editedId"
    | "editedKeys"
    | "ownedId"
    | "level"
    | "onLevelChange"
    | "selectedKey"
    | "onSelect"
  > | null;
  /** What stands where the plan would be while there is none. */
  placeholder?: ComponentChildren;
  /** Under the plan: the layout and sizing notices. */
  after?: ComponentChildren;
  /** What the plan's status says that the editor must not lose (null: nothing). */
  problem?: EditorProblem | null;
  onRetry?: () => void;
  /** The stage's View switch (Top / 3D), the workspace's own: the choice carries into and out of the editor. */
  view?: StageView;
  onViewChange?: (view: StageView) => void;
  /** The browser can draw the 3D view. */
  webgl?: boolean;
  /** The 3D view of the plan (its selection and layer cut are the editor's); null while there is none. */
  viewer?: Omit<
    ViewerProps,
    | "trays"
    | "components"
    | "groups"
    | "selectedKey"
    | "onSelect"
    | "topLayer"
    | "levels"
    | "litKeys"
  > | null;
  /**
   * The normal stage, drawn by this same component while no item is edited, so the 3D view is one
   * `Viewer` across opening and closing an editor: same place in the tree, only its props change
   * (the camera, Spread apart and the scene stay).
   */
  normal?: NormalStage;
}

/** What the normal stage gives the shared frame (App): its heading and switches, and its column. */
export interface NormalStage {
  /** The status heading and the switches. */
  top: ComponentChildren;
  /** The column when it is not the 3D view: the plan, or the placeholder. */
  body: ComponentChildren;
  /** The 3D view, when that is what the column shows: the slot above it and the viewer's props. */
  threeD: { slot: StageSlotProps; viewer: ViewerProps } | null;
  /** Under the plan: the layout and sizing notices. */
  after: ComponentChildren;
}

/**
 * The frame both stages share: what stands above the column, and the column. The 3D view is the
 * same element at the same place in it whichever stage draws it, so opening or closing an editor
 * only changes its props.
 */
function StageFrame({
  top,
  className,
  threeD,
  body,
  after,
}: {
  top: ComponentChildren;
  className?: string;
  threeD: { slot: StageSlotProps; viewer: ViewerProps } | null;
  body: ComponentChildren;
  after: ComponentChildren;
}) {
  return (
    <>
      {top}
      <section
        class={`plan-col${className ? ` ${className}` : ""}`}
        aria-label="Preview"
        data-region="plan"
      >
        {threeD !== null ? (
          <>
            <StageSlot {...threeD.slot} />
            <Viewer {...threeD.viewer} />
          </>
        ) : (
          body
        )}
        {after}
      </section>
    </>
  );
}

const nothing = (): void => undefined;

/**
 * The status heading's place: the sentence (the page's h1), or the note in its place. The note's
 * region is always on the page, so a reader hears it arrive.
 */
function Slot({
  sentence,
  note,
  onNoteDone,
  problem,
  onRetry,
  trailing,
}: {
  /** The sentence, drawn or not (`hidden`: the note is in its place). */
  sentence: (hidden: boolean) => ComponentChildren;
  /** At the row's right end: the Top / 3D switch, where the normal stage's toolbar has it. */
  trailing?: ComponentChildren;
  note: EditNote | null;
  onNoteDone: () => void;
  problem?: EditorProblem | null;
  onRetry?: () => void;
}) {
  return (
    <div class="ed-slot" data-region="status">
      <div class="ed-slot__row">
        <Toast message={note?.text ?? null} nonce={note?.id} onDone={onNoteDone} />
        {sentence(note !== null)}
        {trailing}
      </div>
      {problem ? <ProblemLine problem={problem} onRetry={onRetry} /> : null}
    </div>
  );
}

/**
 * What the editor is for: an item or a group, the trays that are its own in the plan, the ids that
 * light with it and the sentence that says which tray this is.
 */
function targetOf(
  p: {
    componentId?: string;
    groupId?: string;
    components: readonly Component[];
    groups?: readonly Group[];
  },
  trays: readonly TraySpec[],
) {
  const group = p.groupId === undefined ? undefined : groupById({ groups: p.groups }, p.groupId);
  if (group !== undefined) {
    const mine = traysOfGroup({ components: p.components, groups: p.groups }, group.id, trays);
    return {
      id: group.id,
      mine,
      edited: { editedKeys: mine.map((t) => t.key) },
      sentence: (mine: readonly TraySpec[], tag?: "h1" | "p", hidden?: boolean) => (
        <GroupSentence group={group} trays={mine} tag={tag} hidden={hidden} />
      ),
    };
  }
  const component =
    p.componentId === undefined ? undefined : p.components.find((c) => c.id === p.componentId);
  if (component === undefined) {
    return undefined;
  }
  return {
    id: component.id,
    mine: traysOfComponent(trays, p.components, component.id),
    // a member of a group has its own wells outlined among the group's lifted trays
    edited: {
      editedId: component.id,
      ownedId:
        groupOfItem({ groups: p.groups }, component.id) === undefined ? undefined : component.id,
    },
    sentence: (mine: readonly TraySpec[], tag?: "h1" | "p", hidden?: boolean) => (
      <StageSentence component={component} trays={mine} tag={tag} hidden={hidden} />
    ),
  };
}

/**
 * The keys the 3D view lights for the edited trays: each of theirs, and the spacers and dividers
 * that stand in them (they travel with their tray).
 */
function litKeysOf(mine: readonly TraySpec[], trays: readonly TraySpec[]): string[] {
  const keys = new Set(mine.map((t) => t.key));
  return trays
    .filter(
      (t) =>
        keys.has(t.key) ||
        ((t.part === "spacer" || t.part === "divider") && keys.has(parentKey(t))),
    )
    .map((t) => t.key);
}

/**
 * The stage of the editor, on the normal stage's frame: the sentence where the status heading
 * stood, the Layer and Top / 3D switches, an empty band where the tray bar stands, and the box
 * with the edited trays lifted (from above) or lit (in 3D), the rest dimmed.
 */
export function EditorStage({
  componentId,
  groupId,
  components,
  groups,
  trays,
  note,
  onNoteDone,
  phone = false,
  plan,
  placeholder,
  after,
  problem,
  onRetry,
  view = "plan",
  onViewChange = nothing,
  webgl = true,
  viewer = null,
  normal,
}: EditorStageProps) {
  // The layer the person picked (null: All), for this item or group only, for the top view and 3D
  // alike: another item opens on its own layer.
  const [picked, setPicked] = useState<{ id: string; layer: number | null } | null>(null);
  // The 3D scene is redrawn once a change has settled, not on each keystroke: it is given the
  // model as it stood when the last change was over.
  const [sTrays, sComponents, sGroups, sBox, sSettings, sStale] = useSettled(
    [trays, components, groups, viewer?.box, viewer?.settings, viewer?.stale],
    SETTLE_MS,
  );
  const target = targetOf({ componentId, groupId, components, groups }, trays);
  if (target === undefined) {
    return normal === undefined ? null : (
      <StageFrame top={normal.top} threeD={normal.threeD} body={normal.body} after={normal.after} />
    );
  }
  const { mine } = target;
  // The box opens on the layer of the first tray, so its lift is in sight; the Layer switch moves
  // it to see the others (the top view's: one layer at a time).
  const levels = levelsOf(trays);
  const home = mine[0] === undefined ? 0 : Math.max(0, levels.indexOf(mine[0].level));
  const in3d = view === "3d" && plan !== null && !phone;
  // Until a pick, the top view shows the item's own layer and 3D shows every layer, as the workspace's do.
  const choice = picked !== null && picked.id === target.id ? picked : null;
  const pick: number | null =
    choice !== null && (choice.layer === null || choice.layer < levels.length)
      ? choice.layer
      : in3d
        ? null
        : home;
  const at = pick ?? Math.max(0, levels.length - 1);
  const cut = pick;
  const layers =
    levels.length > 1 ? (
      <Segmented
        label="Layer"
        tone="track"
        options={layerOptions(trays)}
        value={layerValueOf(pick, levels.length)}
        onChange={(v) => setPicked({ id: target.id, layer: v === "all" ? null : Number(v) })}
      />
    ) : undefined;
  const showView = plan !== null && !phone;
  const status = phone ? undefined : (
    <Slot
      sentence={(hidden) => target.sentence(mine, "h1", hidden)}
      note={note}
      onNoteDone={onNoteDone}
      problem={problem}
      onRetry={onRetry}
      trailing={
        showView ? (
          <span data-region="view-switch">
            <ViewSwitch view={view} onViewChange={onViewChange} webgl={webgl} />
          </span>
        ) : undefined
      }
    />
  );
  // The same rows as the workspace's (StageTop): the toolbar holds the View switch, the Layer switch has the row under it.
  const switches =
    phone || layers === undefined ? null : (
      <div class="stage-segs" data-region="switches">
        <div class="stage-segs__layer">{layers}</div>
      </div>
    );
  // The tray bar's place stays, empty, so the frame is where the normal stage's is.
  const band = <span class="ed-band" />;
  // What the 3D view draws: the model as it was when the last change was over, and the edited trays lit.
  const settledTarget = targetOf(
    { componentId, groupId, components: sComponents ?? components, groups: sGroups },
    sTrays ?? trays,
  );
  const lit = settledTarget === undefined ? [] : litKeysOf(settledTarget.mine, sTrays ?? trays);
  const top = (
    <>
      {status}
      {switches}
      {showView && !webgl ? <WebGlNote /> : null}
    </>
  );
  const threeD =
    plan !== null && in3d && viewer !== null
      ? {
          slot: {},
          viewer: {
            ...viewer,
            trays: sTrays ?? trays,
            components: sComponents,
            groups: sGroups,
            box: sBox ?? viewer.box,
            settings: sSettings ?? viewer.settings,
            stale: sStale,
            selectedKey: null,
            onSelect: nothing,
            topLayer: cut,
            levels,
            litKeys: lit,
          } satisfies ViewerProps,
        }
      : null;
  const body =
    plan === null ? (
      <>
        {phone ? null : <StageSlot />}
        {placeholder}
      </>
    ) : (
      <PlanView
        {...plan}
        bar={phone ? undefined : band}
        {...target.edited}
        level={at}
        layerAll={pick === null}
        onLevelChange={nothing}
        selectedKey={null}
        onSelect={nothing}
      />
    );
  return <StageFrame top={top} className="ed-stage" threeD={threeD} body={body} after={after} />;
}

const STRIP_PX = 84;

/**
 * MobileEdit's strip under the sheet's header: the box drawn small with the component's trays in
 * full and the rest at half, and the sentence that says which tray this is (or the note). The
 * picture is for the eye only.
 */
export function EditorStrip({
  componentId,
  groupId,
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
  /** The item being edited. Without it, `groupId` names the group being edited. */
  componentId?: string;
  groupId?: string;
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
  const target = targetOf({ componentId, groupId, components, groups }, trays);
  if (target === undefined) {
    return null;
  }
  const { mine } = target;
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
        {note === null ? target.sentence(mine, "p") : null}
        {problem ? <ProblemLine problem={problem} onRetry={onRetry} /> : null}
      </div>
    </div>
  );
}
