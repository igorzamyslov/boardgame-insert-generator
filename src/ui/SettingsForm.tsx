// src/ui/SettingsForm.tsx
// The fields of the Settings drawer, from the Settings board: "This insert" (how the trays sit,
// then Exact numbers) and the Printing options. The words are the board's, except where DESIGN §7
// rules them (the Words table, the groups the board does not show).
import { useContext, useEffect, useId, useRef, useState } from "preact/hooks";
import {
  DEFAULT_SETTINGS,
  FLOAT_EPSILON,
  WALL_CHOICES,
  applyFingerRoom,
  applyFitChoice,
  applyWallChoice,
  fingerRoomOf,
  fitChoiceOf,
  wallChoiceOf,
} from "../model/settings";
import type { FitChoice, WallChoice } from "../model/settings";
import { socketOf, withJoint } from "../model/lip";
import type { Joint, LipJoint, Settings } from "../model/types";
import { SETTING_RANGES } from "../model/validate";
import { CheckRow, DisclosureRow, SearchField, Segmented } from "../kit";
import { ONE_WALL_MAX_MM } from "../sizing/constants";
import { messagesOf } from "./FieldMessages";
import { formatNumber, numberInputAttrs, useNumberText } from "./NumberField";
import type { NumberRules } from "./NumberField";
import { SETTING_SETTERS, applySpareRoom, settingUnit, spareRoomOf } from "./settingsFields";
import type { SpareRoom } from "./settingsFields";
import type { NameExample } from "./settingsFields";
import { EXACT_GROUPS, groupOfPath } from "./settingsGroups";
import type { ExactGroup } from "./settingsGroups";
import { ValidationContext, useFieldNotices } from "./validation";
import "./settings.css";

export interface SettingsFormProps {
  settings: Settings;
  onChange: (s: Settings) => void;
}

type Range = (typeof SETTING_RANGES)[number];

/** The exact numbers whose value differs from the default. */
export function changedRanges(s: Settings): Range[] {
  return SETTING_RANGES.filter((r) => r.get(s) !== r.get(DEFAULT_SETTINGS));
}

const rangeOf = (path: string): Range | undefined => SETTING_RANGES.find((r) => r.path === path);

const inputId = (r: Range): string => `settings-${r.path.replace("/", "-")}`;

/** A dot after a label: this value differs from its default. */
function Dot({ named = false }: { named?: boolean }) {
  return named ? (
    <span class="st-dot" role="img" aria-label="Changed" />
  ) : (
    <span class="st-dot" aria-hidden="true" />
  );
}

// ---- The rows of a group --------------------------------------------------------------------

type RowSpec =
  | { kind: "number"; key: string; range: Range; words: string }
  | { kind: "leftover" | "spareRoom"; key: string; words: string };

const LEFTOVER_WORDS = "Unused space spare tray solid block";
const SPARE_ROOM_WORDS =
  "Fill the space that's left separate spacers bigger wells thicker walls one thick wall instead of a spacer extra thickness per wall";

/** The numbers a choice draws itself (Fill the space that's left draws the wall thickness), so they are no row of their own. */
const NESTED_PATHS: readonly string[] = ["wallAbsorb"];

function rowsOf(g: ExactGroup): RowSpec[] {
  const extras: RowSpec[] = (g.extras ?? []).map((kind) => ({
    kind,
    key: kind,
    words: `${kind === "leftover" ? LEFTOVER_WORDS : SPARE_ROOM_WORDS} ${g.title}`,
  }));
  const numbers: RowSpec[] = g.paths.flatMap((path) => {
    const range = rangeOf(path);
    return range === undefined || NESTED_PATHS.includes(path)
      ? []
      : [
          {
            kind: "number" as const,
            key: path,
            range,
            words: `${range.label} ${range.hint} ${g.title}`,
          },
        ];
  });
  return [...extras, ...numbers];
}

/** True when every word of the query is in the row's name or its words (case does not matter). */
function matchesQuery(words: string, query: string): boolean {
  const text = words.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => text.includes(w));
}

/**
 * A number of an open group: its name, the 72 px box and, while it differs from its default, the
 * way back. A `plain` one is a number inside a choice that carries the dot and the way back itself
 * (`rules` then say what the box takes there).
 */
function NumberRow({
  range,
  settings,
  onChange,
  plain = false,
  rules,
  showUnit = false,
}: SettingsFormProps & {
  range: Range;
  plain?: boolean;
  rules?: NumberRules;
  /** Say the unit beside the box: a row outside Exact numbers has no "All in mm." over it. */
  showUnit?: boolean;
}) {
  const id = inputId(range);
  const path = `/settings/${range.path}`;
  const set = SETTING_SETTERS[range.path];
  const value = range.get(settings);
  const fallback = range.get(DEFAULT_SETTINGS);
  const changed = !plain && value !== fallback;
  const typed = useNumberText(
    value,
    (v) => {
      if (set) {
        onChange(set(settings, v));
      }
    },
    rules ?? { min: range.min, max: range.max },
  );
  const { errors, notes } = messagesOf(useFieldNotices(path));
  const error = typed.error ?? (errors.length > 0 ? errors.join(" ") : null);
  const unit = settingUnit(range.path);
  const describedBy = [
    error !== null ? `${id}-error` : null,
    notes.length > 0 ? `${id}-notes` : null,
  ]
    .filter((x) => x !== null)
    .join(" ");
  const box = (
    <input
      id={id}
      class="st-num"
      type="text"
      {...numberInputAttrs(false)}
      autoComplete="off"
      value={typed.text}
      data-changed={changed ? "" : undefined}
      aria-invalid={error !== null ? true : undefined}
      aria-describedby={describedBy === "" ? undefined : describedBy}
      onInput={(e) => typed.onInput(e.currentTarget.value)}
      onBlur={typed.onBlur}
      onKeyDown={typed.onKeyDown}
    />
  );
  return (
    <>
      <label class="st-row__label" htmlFor={id}>
        {range.label}
        {unit !== undefined ? <span class="visually-hidden">{` (${unit})`}</span> : null}
        {changed ? <Dot /> : null}
      </label>
      {showUnit && unit !== undefined ? (
        <span class="st-num-unit">
          {box}
          <span class="st-num-unit__text" aria-hidden="true">
            {unit}
          </span>
        </span>
      ) : (
        box
      )}
      {changed ? (
        <button
          type="button"
          class="st-back"
          aria-label={`Back to ${formatNumber(fallback)} for ${range.label}`}
          onClick={() => {
            if (set) {
              onChange(set(settings, fallback));
            }
            // The button goes with the difference: keep the keyboard where it was.
            document.getElementById(id)?.focus();
          }}
        >
          {`Back to ${formatNumber(fallback)}`}
        </button>
      ) : (
        <span />
      )}
      {error !== null ? (
        <p class="st-row__msg k-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
      {notes.length > 0 ? (
        <p class="st-row__msg st-note" id={`${id}-notes`}>
          {notes.join(" ")}
        </p>
      ) : null}
    </>
  );
}

/**
 * A switch of Settings: the kit's CheckRow, with the changed dot after its label and, while it
 * differs from its default, a way back under it ("Back to off"), as the numbers have. The default
 * is the switch's own: `changed` says it differs and `defaultOn` what Back puts it to.
 */
function SwitchRow({
  label,
  hint,
  compact,
  blocked,
  checked,
  changed,
  defaultOn,
  onChange,
  onBack,
}: {
  label: string;
  hint?: string;
  compact?: boolean;
  blocked?: boolean;
  checked: boolean;
  changed: boolean;
  defaultOn: boolean;
  onChange: (on: boolean) => void;
  onBack: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const word = defaultOn ? "on" : "off";
  return (
    <div class="st-switch" ref={wrap}>
      <CheckRow
        label={label}
        hint={hint}
        compact={compact}
        blocked={blocked}
        checked={checked}
        changed={changed}
        onChange={onChange}
      />
      {changed ? (
        <button
          type="button"
          class="st-back st-back--switch"
          aria-label={`Back to ${word} for ${label}`}
          onClick={() => {
            onBack();
            // The button goes with the difference: keep the keyboard on the switch.
            wrap.current?.querySelector("input")?.focus();
          }}
        >
          {`Back to ${word}`}
        </button>
      ) : null}
    </div>
  );
}

const LEFTOVER_CHOICES = [
  { value: "spare", label: "Spare tray" },
  { value: "solid", label: "Solid block" },
] as const;

function LeftoverRow({ settings, onChange }: SettingsFormProps) {
  const changed = settings.leftover !== DEFAULT_SETTINGS.leftover;
  return (
    <div class="st-row__choice">
      <span class="st-row__label">
        Unused space
        {changed ? <Dot /> : null}
      </span>
      <Segmented
        label="Unused space"
        stretch
        options={LEFTOVER_CHOICES}
        value={settings.leftover}
        onChange={(leftover) => onChange({ ...settings, leftover })}
      />
    </div>
  );
}

const SPARE_ROOM_LABEL = "Fill the space that's left";

const SPARE_ROOM_CHOICES: readonly { value: SpareRoom; label: string }[] = [
  { value: "spacer", label: "Separate spacers" },
  { value: "wells", label: "Bigger wells" },
  { value: "walls", label: "Thicker walls" },
  { value: "one", label: "One thick wall" },
];

/** What each choice does, as the engine does it (`realize.ts`, `layout/context.ts`). */
function spareRoomLine(s: Settings): string {
  switch (spareRoomOf(s)) {
    case "spacer":
      return "Room left beside a tray is printed as separate spacers.";
    case "wells":
      return "Room left goes into the wells of items set to As much as fits first, then into the others' wells as far as each can use it. What is still left is a separate spacer.";
    case "walls":
      return `Instead of a spacer, every wall and divider may get up to ${formatNumber(s.wallAbsorb)} mm thicker.`;
    case "one":
      return `Instead of a spacer, one outer wall in each direction takes up to ${ONE_WALL_MAX_MM} mm, avoiding walls with a finger cut. A bigger gap still gets a spacer.`;
  }
}

/** The wall thickness box of "Thicker walls": above 0, as 0 is "Separate spacers". */
const WALL_THICKNESS_RULES: NumberRules = {
  min: 0,
  minExclusive: true,
  max: rangeOf("wallAbsorb")?.max,
};

/**
 * What happens to a gap a tray cannot use: a separate spacer (the default), every wall and divider
 * a little thicker, or one thick wall. The engine has two settings for it, thicker walls (a number)
 * and one thick wall (a switch that replaces it), so they are one choice here, with the number
 * shown under it while thicker walls are chosen.
 */
function SpareRoomRow({ settings, onChange }: SettingsFormProps) {
  const choice = spareRoomOf(settings);
  const changed = choice !== "spacer";
  const wrap = useRef<HTMLDivElement>(null);
  const range = rangeOf("wallAbsorb");
  return (
    <>
      <div class="st-row__choice st-row__choice--wrap" ref={wrap}>
        <span class="st-row__label">
          {SPARE_ROOM_LABEL}
          {changed ? <Dot /> : null}
        </span>
        <Segmented
          label={SPARE_ROOM_LABEL}
          stretch
          options={SPARE_ROOM_CHOICES.map((o) =>
            o.value === choice && changed ? { ...o, changed } : o,
          )}
          value={choice}
          onChange={(next) => onChange(applySpareRoom(settings, next))}
        />
        <span class="st-note">{spareRoomLine(settings)}</span>
        {changed ? (
          <button
            type="button"
            class="st-back"
            aria-label={`Back to separate spacers for ${SPARE_ROOM_LABEL}`}
            onClick={() => {
              onChange(applySpareRoom(settings, "spacer"));
              // The button goes with the difference: keep the keyboard on the choice.
              wrap.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
            }}
          >
            Back to separate spacers
          </button>
        ) : null}
      </div>
      {choice === "walls" && range !== undefined ? (
        <NumberRow
          range={range}
          settings={settings}
          onChange={onChange}
          plain
          rules={WALL_THICKNESS_RULES}
        />
      ) : null}
    </>
  );
}

function RowOf({ row, settings, onChange }: SettingsFormProps & { row: RowSpec }) {
  if (row.kind === "number") {
    return <NumberRow range={row.range} settings={settings} onChange={onChange} />;
  }
  return row.kind === "leftover" ? (
    <LeftoverRow settings={settings} onChange={onChange} />
  ) : (
    <SpareRoomRow settings={settings} onChange={onChange} />
  );
}

/** How many of a group's values differ from their defaults. */
function changedIn(g: ExactGroup, s: Settings): number {
  const differs = (p: string): boolean => {
    const r = rangeOf(p);
    return r !== undefined && r.get(s) !== r.get(DEFAULT_SETTINGS);
  };
  // Room for fingers writes two numbers (wall and divider room): one setting, as the header counts it.
  const room = ["fingerPocket/wallRoom", "fingerPocket/dividerRoom"];
  // Fill the space that's left writes the wall thickness, the one-wall switch and bigger wells: one choice, drawn as one row.
  const numbers =
    g.paths.filter((p) => !room.includes(p) && !NESTED_PATHS.includes(p) && differs(p)).length +
    (g.paths.some((p) => room.includes(p)) && room.some(differs) ? 1 : 0);
  const extras = (g.extras ?? []).filter((e) =>
    e === "spareRoom"
      ? spareRoomOf(s) !== spareRoomOf(DEFAULT_SETTINGS)
      : s[e] !== DEFAULT_SETTINGS[e],
  ).length;
  return numbers + extras;
}

/** An open group: its name and what changed in it over its rows. */
function Card({
  group,
  rows,
  settings,
  onChange,
}: SettingsFormProps & { group: ExactGroup; rows: readonly RowSpec[] }) {
  const headId = useId();
  const changed = changedIn(group, settings);
  return (
    <div class="st-card" role="group" aria-labelledby={headId} data-group={group.id}>
      <div class="st-card__head">
        <span class="st-card__title" id={headId}>
          {group.title}
        </span>
        {changed > 0 ? <span class="st-card__changed">{`${changed} changed`}</span> : null}
      </div>
      <div class="st-rows">
        {rows.map((row) => (
          <RowOf key={row.key} row={row} settings={settings} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}

// ---- Exact numbers --------------------------------------------------------------------------

interface ExactProps extends SettingsFormProps {
  /** Opens a group and puts the focus on a number: "Custom" walls take the person to the Wall. */
  open: string;
  onOpen: (id: string) => void;
  query: string;
  onQuery: (text: string) => void;
}

/** The numbers behind the choices: a search, and the groups, one open at a time. */
function ExactNumbers({ settings, onChange, open, onOpen, query, onQuery }: ExactProps) {
  const notices = useContext(ValidationContext);
  // A group with an error in one of its fields opens, and stays open while the person mends it.
  const forced = useRef(new Set<string>());
  const withError = new Set<string>();
  for (const n of notices) {
    const g = n.level === "error" && n.path !== undefined ? groupOfPath(n.path) : undefined;
    if (g !== undefined) {
      forced.current.add(g.id);
      withError.add(n.path ?? "");
    }
  }
  const searching = query.trim() !== "";
  const all = EXACT_GROUPS.map((g) => ({ group: g, rows: rowsOf(g) }));
  const total = all.reduce((n, g) => n + g.rows.length, 0);
  // A field with an error stays on screen whatever the search says.
  const shown = all
    .map(({ group, rows }) => ({
      group,
      rows: searching
        ? rows.filter(
            (r) =>
              matchesQuery(r.words, query) ||
              (r.kind === "number" && withError.has(`/settings/${r.range.path}`)) ||
              (r.kind === "spareRoom" && withError.has("/settings/wallAbsorb")),
          )
        : rows,
    }))
    .filter(({ rows }) => rows.length > 0);
  const count = shown.reduce((n, g) => n + g.rows.length, 0);
  return (
    <section class="st-sec st-sec--exact" aria-labelledby="settings-exact-title">
      <div class="st-sec__head">
        <h2 class="st-h2" id="settings-exact-title">
          Exact numbers
        </h2>
        <span class="st-note">For fine-tuning. All in mm.</span>
      </div>
      <div class="st-search">
        <SearchField
          label="Find a setting"
          placeholder="Find a setting, like floor or lip"
          value={query}
          onInput={onQuery}
        />
        <p class="st-status" role="status">
          {searching
            ? count === 0
              ? "No exact number matches."
              : `${count} of ${total} shown.`
            : ""}
        </p>
      </div>
      <div class="st-groups">
        {shown.map(({ group, rows }) =>
          searching || open === group.id || forced.current.has(group.id) ? (
            <Card
              key={group.id}
              group={group}
              rows={rows}
              settings={settings}
              onChange={onChange}
            />
          ) : (
            <DisclosureRow
              key={group.id}
              title={group.title}
              meta={`${rows.length} values`}
              changed={changedIn(group, settings)}
              open={false}
              onClick={() => onOpen(group.id)}
            />
          ),
        )}
      </div>
    </section>
  );
}

// ---- How the trays sit ----------------------------------------------------------------------

const FIT_OPTIONS = [
  { value: "tight", label: "Snug" },
  { value: "normal", label: "Standard" },
  { value: "loose", label: "Loose" },
  { value: "custom", label: "Custom", changed: true },
] as const;

/** A name over its control: the board's 600 weight label, a dot when the value was changed. */
function Labelled({
  label,
  changed,
  children,
  line,
}: {
  label: string;
  changed: boolean;
  children: preact.ComponentChildren;
  line?: string;
}) {
  return (
    <div class="st-field">
      <span class="st-field__label">
        {label}
        {changed ? <Dot named /> : null}
      </span>
      {children}
      {line !== undefined ? <span class="st-note">{line}</span> : null}
    </div>
  );
}

/** What the rim and groove cost, under "Rim between layers". */
export const RIM_KIND_RIM_LINE = "Trays with one on top get thicker walls.";
/** What Auto does, before a plan says which joint it chose. */
export const RIM_AUTO_LINE = "Plans with both and uses the better one.";
/** What the choice Off means for a stack. */
export const RIM_OFF_LINE = "Stacked trays are not held in place.";

/** What Auto chose for the plan, and why it is worth having: the one thing each joint gives. */
export function rimAutoLine(planned: Joint | undefined): string {
  switch (planned) {
    case "rim":
      return "Auto: rim and groove (trays stay full depth)";
    case "step":
      return "Auto: stepped base (walls stay thin)";
    default:
      return RIM_AUTO_LINE;
  }
}

/** The joints of "Rim between layers", in the order the board shows them. */
const RIM_CHOICES: readonly { value: LipJoint; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "auto", label: "Auto" },
  { value: "rim", label: "Rim and groove" },
  { value: "step", label: "Stepped base" },
];

/**
 * Rim between layers (owner, 2026-10-24): one choice, Off, Auto (the default: the planner tries
 * the rim and groove and the stepped base and uses the better plan), or one joint. The line under
 * it says what the choice costs, or which joint Auto chose for the plan.
 */
function RimBetweenLayers({
  settings,
  planned,
  onChange,
}: SettingsFormProps & { planned?: Joint }) {
  const joint = settings.lip.joint;
  const socket = socketOf(withJoint(settings, "step"), true);
  const line =
    joint === "off"
      ? RIM_OFF_LINE
      : joint === "auto"
        ? rimAutoLine(planned)
        : joint === "rim"
          ? RIM_KIND_RIM_LINE
          : `Walls stay thin; a tray with one on top is ${formatNumber(socket?.depth ?? 0)} mm deeper.`;
  return (
    <Labelled label="Rim between layers" changed={joint !== DEFAULT_SETTINGS.lip.joint} line={line}>
      <Segmented<LipJoint>
        label="Rim between layers"
        stretch
        options={RIM_CHOICES.map((o) =>
          o.value === DEFAULT_SETTINGS.lip.joint ? o : { ...o, changed: true },
        )}
        value={joint}
        onChange={(next) => onChange({ ...settings, lip: { ...settings.lip, joint: next } })}
      />
    </Labelled>
  );
}

/** What the least riser does, under its box: the trays carry any smaller padding as a thicker floor. */
const MIN_RISER_LINE = "Smaller padding stays a thicker tray floor.";

/** "Separate risers from": the one number of the first screen, beside the switches it belongs with. */
function MinRiserRow({ settings, onChange }: SettingsFormProps) {
  const range = rangeOf("minRiser");
  return range === undefined ? null : (
    <div class="st-rows st-rows--lone">
      <NumberRow range={range} settings={settings} onChange={onChange} showUnit />
      <p class="st-row__msg st-note">{MIN_RISER_LINE}</p>
    </div>
  );
}

/**
 * What Walls says under a Custom choice: the wall number when the wall is no choice's, else the
 * floor or the dividers, which a choice writes with it.
 */
function customWallsLine(s: Settings): string {
  const wall = Object.values(WALL_CHOICES).some((w) => Math.abs(w - s.wall) < FLOAT_EPSILON);
  return wall
    ? "You set the floor or the dividers below."
    : `You set the wall to ${formatNumber(s.wall)} mm below.`;
}

function HowTheTraysSit({
  settings,
  planned,
  onChange,
  onCustom,
}: SettingsFormProps & {
  /** The joint Auto chose for the current plan, when there is one. */
  planned?: Joint;
  /** "Custom" takes the person to the number: open this group and focus this field. */
  onCustom: (group: string, fieldId: string) => void;
}) {
  const wall = wallChoiceOf(settings);
  const fit = fitChoiceOf(settings);
  return (
    <section class="st-sec" aria-labelledby="settings-sit-title">
      <h2 class="st-h2" id="settings-sit-title">
        How the trays sit
      </h2>
      <Labelled
        label="Fit in the box"
        changed={settings.fit !== DEFAULT_SETTINGS.fit}
        line={
          fit === "custom" ? `You set the fit to ${formatNumber(settings.fit)} below.` : undefined
        }
      >
        <Segmented<FitChoice | "custom">
          label="Fit in the box"
          stretch
          options={FIT_OPTIONS}
          value={fit}
          onChange={(c) => {
            if (c === "custom") {
              onCustom("room", "settings-fit");
            } else {
              onChange(applyFitChoice(settings, c));
            }
          }}
        />
      </Labelled>
      <Labelled
        label="Walls"
        changed={wall !== wallChoiceOf(DEFAULT_SETTINGS)}
        line={wall === "custom" ? customWallsLine(settings) : undefined}
      >
        <Segmented<WallChoice | "custom">
          label="Walls"
          stretch
          options={[
            { value: "thin", label: "Thin" },
            { value: "normal", label: "Standard" },
            { value: "sturdy", label: "Sturdy" },
            { value: "custom", label: "Custom", changed: true },
          ]}
          value={wall}
          onChange={(c) => {
            if (c === "custom") {
              onCustom("walls", "settings-wall");
            } else {
              onChange(applyWallChoice(settings, c));
            }
          }}
        />
      </Labelled>
      <div class="st-checks">
        <SwitchRow
          label="Room for fingers"
          hint="Extra space beside walls to reach in"
          checked={fingerRoomOf(settings) !== false}
          // it is one switch though it writes two numbers: either one off its default is a change
          changed={fingerRoomOf(settings) !== fingerRoomOf(DEFAULT_SETTINGS)}
          defaultOn={fingerRoomOf(DEFAULT_SETTINGS) !== false}
          onChange={(on) => onChange(applyFingerRoom(settings, on))}
          onBack={() =>
            onChange(applyFingerRoom(settings, fingerRoomOf(DEFAULT_SETTINGS) !== false))
          }
        />
        <RimBetweenLayers settings={settings} planned={planned} onChange={onChange} />
        <SwitchRow
          label="Fill to the lid"
          hint="Keeps everything snug if the box is stored on its side"
          checked={settings.fillToTop}
          changed={settings.fillToTop !== DEFAULT_SETTINGS.fillToTop}
          defaultOn={DEFAULT_SETTINGS.fillToTop}
          onChange={(fillToTop) => onChange({ ...settings, fillToTop })}
          onBack={() => onChange({ ...settings, fillToTop: DEFAULT_SETTINGS.fillToTop })}
        />
        <MinRiserRow settings={settings} onChange={onChange} />
        <FoldRisers settings={settings} onChange={onChange} />
      </div>
    </section>
  );
}

/** The sheet's "This insert" tab: how the trays sit, then the exact numbers. */
export function InsertSettings({
  settings,
  planned,
  onChange,
}: SettingsFormProps & {
  /** The joint the current plan was made with, so Auto can say which it chose. */
  planned?: Joint;
}) {
  const notices = useContext(ValidationContext);
  const [open, setOpen] = useState(() => {
    const first = notices.find(
      (n) => n.level === "error" && groupOfPath(n.path ?? "") !== undefined,
    );
    return (first === undefined ? undefined : groupOfPath(first.path ?? ""))?.id ?? "walls";
  });
  const [query, setQuery] = useState("");
  // What to give the focus to once the render that opens it is done: the group's first control, or
  // the control with this id (a button that goes when its group opens must not drop the focus).
  const pending = useRef<{ group?: string; id?: string } | null>(null);
  const [, redraw] = useState(0);
  useEffect(() => {
    const want = pending.current;
    pending.current = null;
    if (want === null) {
      return;
    }
    const target =
      want.id !== undefined
        ? document.getElementById(want.id)
        : document.querySelector<HTMLElement>(
            `[data-group="${want.group ?? ""}"] :is(input, button)`,
          );
    target?.focus();
  });
  const focusAfter = (want: { group?: string; id?: string }): void => {
    pending.current = want;
    redraw((n) => n + 1);
  };
  return (
    <div class="st-stack">
      <HowTheTraysSit
        planned={planned}
        settings={settings}
        onChange={onChange}
        onCustom={(group, fieldId) => {
          setQuery("");
          setOpen(group);
          focusAfter({ id: fieldId });
        }}
      />
      <ExactNumbers
        settings={settings}
        onChange={onChange}
        open={open}
        onOpen={(id) => {
          setOpen(id);
          focusAfter({ group: id });
        }}
        query={query}
        onQuery={setQuery}
      />
    </div>
  );
}

// ---- Printing options -----------------------------------------------------------------------

/** "Printing": options that change the printed trays, never where they sit (My printer). */
export function PrintingOptions({
  settings,
  onChange,
  nameExample,
}: SettingsFormProps & { nameExample?: NameExample }) {
  return (
    <section class="st-sec st-sec--printing" aria-labelledby="settings-printing-title">
      <h2 class="st-h2 st-h2--tagged" id="settings-printing-title">
        Printing
        <span class="st-tag">Doesn't move any trays</span>
      </h2>
      <div class="st-checks">
        <SwitchRow
          compact
          label="Engrave tray names"
          hint={
            nameExample === undefined
              ? "Long names are shortened to fit"
              : `Long names are shortened to fit, like “${nameExample.full}” → “${nameExample.short}”`
          }
          checked={settings.engraveNames}
          changed={settings.engraveNames !== DEFAULT_SETTINGS.engraveNames}
          defaultOn={DEFAULT_SETTINGS.engraveNames}
          onChange={(engraveNames) => onChange({ ...settings, engraveNames })}
          onBack={() => onChange({ ...settings, engraveNames: DEFAULT_SETTINGS.engraveNames })}
        />
        <SwitchRow
          compact
          label="Join spacers into fewer pieces to print"
          checked={settings.mergeFillers}
          changed={settings.mergeFillers !== DEFAULT_SETTINGS.mergeFillers}
          defaultOn={DEFAULT_SETTINGS.mergeFillers}
          onChange={(mergeFillers) => onChange({ ...settings, mergeFillers })}
          onBack={() => onChange({ ...settings, mergeFillers: DEFAULT_SETTINGS.mergeFillers })}
        />
      </div>
    </section>
  );
}

/** Folding risers into the joined spacers: it needs joined spacers (a printing option), and says so while it has none. */
function FoldRisers({ settings, onChange }: SettingsFormProps) {
  const blocked = !settings.mergeFillers;
  return (
    <SwitchRow
      label="Fold risers into the joined spacers"
      hint={blocked ? "Needs joined spacers." : undefined}
      blocked={blocked}
      checked={settings.mergeRisers}
      changed={settings.mergeRisers !== DEFAULT_SETTINGS.mergeRisers}
      defaultOn={DEFAULT_SETTINGS.mergeRisers}
      onChange={(mergeRisers) => onChange({ ...settings, mergeRisers })}
      onBack={() => onChange({ ...settings, mergeRisers: DEFAULT_SETTINGS.mergeRisers })}
    />
  );
}
