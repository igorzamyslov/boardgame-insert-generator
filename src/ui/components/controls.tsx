// src/ui/components/controls.tsx
// The pieces the editors are made of, on the kit: a labelled group, a count, a number or a text
// box that shows the engine's messages at its path, a row that opens its exact values in place.
// The words of every control are the boards' (Edit, EditKinds, MobileEdit) or ruled in DESIGN §7.
import type { ComponentChildren, RefObject } from "preact";
import { useContext, useEffect, useId, useRef, useState } from "preact/hooks";
import { DisclosureRow, Field, Segmented, Stepper } from "../../kit";
import type { SegmentedOption } from "../../kit";
import { messagesOf } from "../FieldMessages";
import { COUNT } from "../limits";
import { useNumberText } from "../NumberField";
import type { NumberRules } from "../NumberField";
import { ValidationContext, useFieldNotices } from "../validation";

/** The changed dot (Settings'): this value differs from its default. It is named, so a reader hears it. */
export function Dot() {
  return <span class="ed-dot" role="img" aria-label="Changed" />;
}

/** The way back from a changed value: what it returns to, and the one change that does it. */
export interface Revert {
  /** The default, in the words after "Back to": "Auto", "0", "finger cuts on". */
  to: string;
  /** Puts the value back: one call, so one step of Undo. */
  onBack: () => void;
}

/**
 * Settings' "Back to <default>" pill, in the editor: it shows only while the value differs from its
 * default, and puts it back in one change. The button goes with the difference, so `focus` names
 * where the keyboard goes instead (the control it belongs to).
 */
export function BackLink({
  revert,
  name,
  focus,
}: {
  revert: Revert;
  /** What it reverts, for assistive technology ("Room for more cards"). */
  name: string;
  focus: () => HTMLElement | null | undefined;
}) {
  return (
    <button
      type="button"
      class="ed-reset"
      aria-label={`Back to ${revert.to} for ${name}`}
      onClick={() => {
        revert.onBack();
        // after the render that removes this button
        setTimeout(() => focus()?.focus(), 0);
      }}
    >
      {`Back to ${revert.to}`}
    </button>
  );
}

/** A name over its control: the board's 600 weight label, then the control, 8 px apart. */
export function Group({
  label,
  changed = false,
  children,
  groupRef,
}: {
  label: string;
  /** The value differs from its default: the changed dot after the label. */
  changed?: boolean;
  children: ComponentChildren;
  groupRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div class="ed-group" ref={groupRef}>
      <span class="ed-label">
        {label}
        {changed ? <Dot /> : null}
      </span>
      {children}
    </div>
  );
}

/** The engine's notes at a path (warnings, info): plain words under the control. */
export function Notes({ path }: { path: string | undefined }) {
  const { notes } = messagesOf(useFieldNotices(path));
  return notes.length === 0 ? null : <p class="ed-note">{notes.join(" ")}</p>;
}

/** The engine's errors at a path, as one alert under the control. */
export function Alert({ id, path }: { id: string; path: string | undefined }) {
  const { errors } = messagesOf(useFieldNotices(path));
  return errors.length === 0 ? null : (
    <p class="k-field__error" id={id} role="alert">
      {errors.join(" ")}
    </p>
  );
}

/**
 * Whether the engine has an error at one of the paths, or below one (`path/...`): what opens the
 * disclosure that holds the field.
 */
export function useErrorAt(paths: readonly string[]): boolean {
  const notices = useContext(ValidationContext);
  return notices.some(
    (n) =>
      n.level === "error" &&
      n.path !== undefined &&
      paths.some((p) => n.path === p || n.path?.startsWith(`${p}/`)),
  );
}

/**
 * Open or shut, and opened by an error at one of `paths`: it stays open once an error brought it
 * up, so it does not shut on the person mending the value.
 */
export function useOpenOnError(paths: readonly string[]): [boolean, (open: boolean) => void] {
  const failing = useErrorAt(paths);
  const [open, setOpen] = useState(failing);
  useEffect(() => {
    if (failing) {
      setOpen(true);
    }
  }, [failing]);
  return [open, setOpen];
}

/**
 * One of a few choices: the group's name over a quiet segmented track that takes the width. With a
 * `revert` the value differs from its default: the dot after the name, the chosen segment in the
 * changed ink, and the way back under the track (the default is named there and nowhere else).
 */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  revert,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  revert?: Revert;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shown =
    revert === undefined
      ? options
      : options.map((o) => (o.value === value ? { ...o, changed: true } : o));
  return (
    <Group label={label} changed={revert !== undefined} groupRef={ref}>
      <Segmented label={label} options={shown} value={value} onChange={onChange} stretch />
      {revert !== undefined ? (
        <BackLink
          revert={revert}
          name={label}
          focus={() => ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]')}
        />
      ) : null}
    </Group>
  );
}

export interface NumFieldProps extends NumberRules {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  /** After the value, inside the box ("mm", MobileEdit's). The board's others put it in the label. */
  unit?: string;
  /** Words for assistive technology only, after the label ("of piece 2"). */
  labelExtra?: string;
  /** A class on the field, for the card it sits in. */
  class?: string;
  /** The 44 px box (the default); `false` is the 48 px one (MobileEdit's figure sizes). */
  compact?: boolean;
  /** The label is for assistive technology only (the field's name is on the line above it). */
  hideLabel?: boolean;
  /** The unit is in the name only, not drawn after the value (a narrow box keeps its room for the digits). */
  hideUnit?: boolean;
  /** The validation path whose messages show with the field. */
  path?: string;
  /** "input" commits every valid keystroke (the default); "blur" only when leaving the field. */
  commitOn?: "input" | "blur";
}

/** The kit's field for a number: what is typed, what the rules refuse, and the engine's message. */
export function NumField({
  id,
  label,
  value,
  onCommit,
  unit,
  labelExtra,
  class: extra,
  compact = true,
  hideLabel = false,
  hideUnit = false,
  path,
  commitOn = "input",
  ...rules
}: NumFieldProps) {
  const typed = useNumberText(value, onCommit, rules, commitOn);
  const { errors } = messagesOf(useFieldNotices(path));
  const error = typed.error ?? (errors.length > 0 ? errors.join(" ") : undefined);
  return (
    <>
      <Field
        id={id}
        label={label}
        labelExtra={labelExtra}
        class={extra}
        unit={unit}
        compact={compact}
        hideLabel={hideLabel}
        hideUnit={hideUnit}
        mode={rules.integer === true ? "integer" : "decimal"}
        value={typed.text}
        error={error}
        onInput={typed.onInput}
        onBlur={typed.onBlur}
        onKeyDown={typed.onKeyDown}
      />
      <Notes path={path} />
    </>
  );
}

export interface TextBoxProps {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
  path?: string;
  placeholder?: string;
  labelExtra?: string;
  class?: string;
  /** "input" commits every keystroke (the default); "blur" when the field is left or Enter is pressed. */
  commitOn?: "input" | "blur";
  /** Applied to the text when the field is left or Enter is pressed, before it is committed. */
  normalize?: (text: string) => string;
}

/** The kit's field for words, with the engine's message at its path. */
export function TextBox({
  id,
  label,
  value,
  onCommit,
  path,
  placeholder,
  labelExtra,
  class: extra,
  commitOn = "input",
  normalize,
}: TextBoxProps) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const { errors } = messagesOf(useFieldNotices(path));
  const settle = (): void => {
    const next = normalize ? normalize(text) : text;
    if (next !== text) {
      setText(next);
    }
    if (commitOn === "blur" && next !== value) {
      onCommit(next);
    }
  };
  return (
    <>
      <Field
        id={id}
        label={label}
        labelExtra={labelExtra}
        class={extra}
        mode="text"
        compact
        value={text}
        placeholder={placeholder}
        error={errors.length > 0 ? errors.join(" ") : undefined}
        onInput={(next) => {
          setText(next);
          if (commitOn === "input") {
            onCommit(next);
          }
        }}
        onBlur={settle}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            settle();
          }
        }}
      />
      <Notes path={path} />
    </>
  );
}

/** A count of pieces: Fewer, the number, More, under its question (Edit's "How many cards?"). */
export function CountField({
  label,
  name,
  value,
  onChange,
  path,
  rules = COUNT,
  minReason,
}: {
  /** The question over the stepper. */
  label: string;
  /** The number's name for assistive technology ("Number of cards"). */
  name: string;
  value: number;
  onChange: (value: number) => void;
  path?: string;
  rules?: NumberRules;
  minReason?: string;
}) {
  const alertId = useId();
  return (
    <Group label={label}>
      <Stepper
        label={name}
        value={value}
        min={rules.min ?? 1}
        max={rules.max}
        minReason={minReason}
        onChange={onChange}
      />
      <Alert id={alertId} path={path} />
      <Notes path={path} />
    </Group>
  );
}

/**
 * A row of Edit's list that opens its exact values in place, under it. An error at one of its
 * paths opens it, and it stays open once an error brought it up, so it does not shut on the person
 * mending the value.
 */
export function ExactRow({
  title,
  hint,
  meta,
  errorPaths = [],
  revert,
  blockedReason,
  children,
}: {
  title: string;
  hint?: string;
  meta?: string;
  /** Present: the row stays on screen but opens nothing, and this says why (DESIGN, Flow). */
  blockedReason?: string;
  /** Validation paths of the values inside; an error at one (or below it) opens the row. */
  errorPaths?: readonly string[];
  /** The value inside differs from its default: the dot on the row, and the way back at the foot of its values. */
  revert?: Revert;
  children?: ComponentChildren;
}) {
  const [open, setOpen] = useOpenOnError(errorPaths);
  const panelId = useId();
  if (blockedReason !== undefined) {
    return (
      <div class="ed-exact">
        <DisclosureRow plain title={title} blockedReason={blockedReason} />
      </div>
    );
  }
  return (
    <div class="ed-exact">
      <DisclosureRow
        plain
        title={title}
        hint={hint}
        meta={meta}
        dot={revert !== undefined}
        open={open}
        controls={panelId}
        onClick={() => setOpen(!open)}
      />
      {open ? (
        <div class="ed-panel" id={panelId}>
          {children}
          {revert !== undefined ? (
            <BackLink
              revert={revert}
              name={title}
              focus={() => document.getElementById(panelId)?.querySelector<HTMLElement>("input")}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A name set as a title: Bricolage 700 on a dashed underline (Edit's), or a card's own bold line
 * (MobileEdit's "Hero figures"). Commits every keystroke.
 */
export function TitleInput({
  id,
  label,
  value,
  onCommit,
  class: extra,
}: {
  id?: string;
  /** The name's name for assistive technology; the screen shows no label. */
  label: string;
  value: string;
  onCommit: (value: string) => void;
  class?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <input
      id={id}
      class={`ed-title${extra === undefined ? "" : ` ${extra}`}`}
      type="text"
      autoComplete="off"
      aria-label={label}
      value={text}
      onInput={(e) => {
        const next = e.currentTarget.value;
        setText(next);
        onCommit(next);
      }}
    />
  );
}
