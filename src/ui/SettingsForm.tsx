// src/ui/SettingsForm.tsx
// The fields of the Settings drawer, from the Settings board: "This insert" (how the trays sit,
// then Exact numbers) and the Printing options. The words are the board's, except where DESIGN §7
// rules them (the Words table, the groups the board does not show).
import { useContext, useEffect, useId, useRef, useState } from "preact/hooks";
import {
  DEFAULT_SETTINGS,
  applyFingerRoom,
  applyFitChoice,
  applyWallChoice,
  fingerRoomOf,
  fitChoiceOf,
  wallChoiceOf,
} from "../model/settings";
import type { FitChoice, WallChoice } from "../model/settings";
import type { Settings } from "../model/types";
import { SETTING_RANGES } from "../model/validate";
import { CheckRow, DisclosureRow, SearchField, Segmented } from "../kit";
import { messagesOf } from "./FieldMessages";
import { formatNumber, numberInputAttrs, useNumberText } from "./NumberField";
import { SETTING_SETTERS, settingUnit } from "./settingsFields";
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
  | { kind: "leftover" | "oneWall"; key: string; words: string };

const LEFTOVER_WORDS = "Unused space spare tray solid block";
const ONE_WALL_WORDS = "One thick wall instead of a spacer";

function rowsOf(g: ExactGroup): RowSpec[] {
  const extras: RowSpec[] = (g.extras ?? []).map((kind) => ({
    kind,
    key: kind,
    words: `${kind === "leftover" ? LEFTOVER_WORDS : ONE_WALL_WORDS} ${g.title}`,
  }));
  const numbers: RowSpec[] = g.paths.flatMap((path) => {
    const range = rangeOf(path);
    return range === undefined
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

function NumberRow({ range, settings, onChange }: SettingsFormProps & { range: Range }) {
  const id = inputId(range);
  const path = `/settings/${range.path}`;
  const set = SETTING_SETTERS[range.path];
  const value = range.get(settings);
  const fallback = range.get(DEFAULT_SETTINGS);
  const changed = value !== fallback;
  const typed = useNumberText(
    value,
    (v) => {
      if (set) {
        onChange(set(settings, v));
      }
    },
    { min: range.min, max: range.max },
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
  return (
    <>
      <label class="st-row__label" htmlFor={id}>
        {range.label}
        {unit !== undefined ? <span class="visually-hidden">{` (${unit})`}</span> : null}
        {changed ? <Dot /> : null}
      </label>
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

const LEFTOVER_CHOICES = [
  { value: "spare", label: "Spare tray" },
  { value: "solid", label: "Solid block" },
] as const;

function LeftoverRow({ settings, onChange }: SettingsFormProps) {
  const changed = settings.leftover !== DEFAULT_SETTINGS.leftover;
  return (
    <>
      <span class="st-row__label">
        Unused space
        {changed ? <Dot /> : null}
      </span>
      <div class="st-row__control">
        <Segmented
          label="Unused space"
          stretch
          options={LEFTOVER_CHOICES}
          value={settings.leftover}
          onChange={(leftover) => onChange({ ...settings, leftover })}
        />
      </div>
    </>
  );
}

function OneWallRow({ settings, onChange }: SettingsFormProps) {
  return (
    <div class="st-row__check">
      <CheckRow
        compact
        label="One thick wall instead of a spacer"
        changed={settings.oneWall !== DEFAULT_SETTINGS.oneWall}
        checked={settings.oneWall}
        onChange={(oneWall) => onChange({ ...settings, oneWall })}
      />
    </div>
  );
}

function RowOf({ row, settings, onChange }: SettingsFormProps & { row: RowSpec }) {
  if (row.kind === "number") {
    return <NumberRow range={row.range} settings={settings} onChange={onChange} />;
  }
  return row.kind === "leftover" ? (
    <LeftoverRow settings={settings} onChange={onChange} />
  ) : (
    <OneWallRow settings={settings} onChange={onChange} />
  );
}

/** How many of a group's values differ from their defaults. */
function changedIn(g: ExactGroup, s: Settings): number {
  const numbers = g.paths.filter((p) => {
    const r = rangeOf(p);
    return r !== undefined && r.get(s) !== r.get(DEFAULT_SETTINGS);
  }).length;
  const extras = (g.extras ?? []).filter((e) => s[e] !== DEFAULT_SETTINGS[e]).length;
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
              (r.kind === "number" && withError.has(`/settings/${r.range.path}`)),
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

function HowTheTraysSit({
  settings,
  onChange,
  onCustomWall,
}: SettingsFormProps & { onCustomWall: () => void }) {
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
            if (c !== "custom") {
              onChange(applyFitChoice(settings, c));
            }
          }}
        />
      </Labelled>
      <Labelled
        label="Walls"
        changed={settings.wall !== DEFAULT_SETTINGS.wall}
        line={
          wall === "custom"
            ? `You set the wall to ${formatNumber(settings.wall)} mm below.`
            : undefined
        }
      >
        <Segmented<WallChoice | "custom">
          label="Walls"
          stretch
          options={[
            { value: "thin", label: "Light" },
            { value: "normal", label: "Standard" },
            { value: "sturdy", label: "Sturdy" },
            { value: "custom", label: "Custom", changed: true },
          ]}
          value={wall}
          onChange={(c) => {
            if (c === "custom") {
              onCustomWall();
            } else {
              onChange(applyWallChoice(settings, c));
            }
          }}
        />
      </Labelled>
      <div class="st-checks">
        <CheckRow
          label="Room for fingers"
          hint="Extra space beside walls to reach in"
          checked={fingerRoomOf(settings) !== false}
          onChange={(on) => onChange(applyFingerRoom(settings, on))}
        />
        <CheckRow
          label="Rim between layers"
          hint="A small rim on each tray keeps the top layer from sliding"
          checked={settings.lip.enabled}
          onChange={(enabled) => onChange({ ...settings, lip: { ...settings.lip, enabled } })}
        />
        <CheckRow
          label="Fill to the lid"
          hint="Keeps everything snug if the box is stored on its side"
          checked={settings.fillToTop}
          onChange={(fillToTop) => onChange({ ...settings, fillToTop })}
        />
      </div>
    </section>
  );
}

/** The sheet's "This insert" tab: how the trays sit, then the exact numbers. */
export function InsertSettings({ settings, onChange }: SettingsFormProps) {
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
        settings={settings}
        onChange={onChange}
        onCustomWall={() => {
          setQuery("");
          setOpen("walls");
          focusAfter({ id: "settings-wall" });
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
        <CheckRow
          compact
          label="Engrave tray names"
          hint={
            nameExample === undefined
              ? "Long names are shortened to fit"
              : `Long names are shortened to fit, like “${nameExample.full}” → “${nameExample.short}”`
          }
          checked={settings.engraveNames}
          onChange={(engraveNames) => onChange({ ...settings, engraveNames })}
        />
        <CheckRow
          compact
          label="Join spacers into fewer pieces to print"
          checked={settings.mergeFillers}
          onChange={(mergeFillers) => onChange({ ...settings, mergeFillers })}
        />
      </div>
    </section>
  );
}

/** Folding risers into the joined spacers: it needs joined spacers, and says so while it has none. */
export function FoldRisers({ settings, onChange }: SettingsFormProps) {
  const blocked = !settings.mergeFillers;
  return (
    <CheckRow
      compact
      label="Fold risers into the joined spacers"
      hint={blocked ? "Needs joined spacers." : undefined}
      blocked={blocked}
      checked={settings.mergeRisers}
      onChange={(mergeRisers) => onChange({ ...settings, mergeRisers })}
    />
  );
}
