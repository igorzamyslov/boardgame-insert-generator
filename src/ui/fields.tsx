// src/ui/fields.tsx
import { useEffect, useState } from "preact/hooks";
import { FieldMessages, describedByIds, messagesOf } from "./FieldMessages";
import { useFieldNotices } from "./validation";

export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
  hint?: string;
  path?: string;
  placeholder?: string;
  commitOn?: "input" | "blur";
  /** Applied to the text when the field is left or Enter is pressed, before it is committed. */
  normalize?: (text: string) => string;
}

export function TextField({
  id,
  label,
  value,
  onCommit,
  hint,
  path,
  placeholder,
  commitOn = "input",
  normalize,
}: TextFieldProps) {
  const [text, setText] = useState(value);
  const notices = useFieldNotices(path);
  useEffect(() => {
    setText(value);
  }, [value]);
  const { errors, notes } = messagesOf(notices);
  function commitPending(): void {
    const next = normalize ? normalize(text) : text;
    if (next !== text) {
      setText(next);
    }
    if (commitOn === "blur" && next !== value) {
      onCommit(next);
    }
  }
  return (
    <div class="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        aria-invalid={errors.length > 0}
        aria-describedby={describedByIds(id, hint, errors, notes)}
        onInput={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          if (commitOn === "input") {
            onCommit(next);
          }
        }}
        onBlur={commitPending}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commitPending();
          }
        }}
      />
      <FieldMessages id={id} hint={hint} errors={errors} notes={notes} />
    </div>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Options with the same group are listed together under its heading. */
  group?: string;
}

export interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
}

function OptionItem<T extends string>({ option: o }: { option: SelectOption<T> }) {
  return (
    <option value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  );
}

/** The options in order, with consecutive ones of a group gathered under it (null: no group). */
function groupsOf<T extends string>(
  options: readonly SelectOption<T>[],
): [string | null, SelectOption<T>[]][] {
  const out: [string | null, SelectOption<T>[]][] = [];
  for (const o of options) {
    const group = o.group ?? null;
    const last = out[out.length - 1];
    if (last && last[0] === group) {
      last[1].push(o);
    } else {
      out.push([group, [o]]);
    }
  }
  return out;
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  const hintId = hint !== undefined ? `${id}-hint` : null;
  return (
    <div class="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        aria-describedby={describedByIds(id, hint, [], [])}
        onChange={(e) => {
          const picked = options.find((o) => o.value === e.currentTarget.value);
          if (picked) {
            onChange(picked.value);
          }
        }}
      >
        {groupsOf(options).map(([group, items]) =>
          group === null ? (
            items.map((o) => <OptionItem key={o.value} option={o} />)
          ) : (
            <optgroup key={group} label={group}>
              {items.map((o) => (
                <OptionItem key={o.value} option={o} />
              ))}
            </optgroup>
          ),
        )}
      </select>
      {hintId !== null ? (
        <p class="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface CheckFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  /** Validation path whose notices are shown with the checkbox. */
  path?: string;
}

export function CheckField({
  id,
  label,
  checked,
  onChange,
  disabled,
  hint,
  path,
}: CheckFieldProps) {
  const { errors, notes } = messagesOf(useFieldNotices(path));
  return (
    <div class="check-field">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-invalid={errors.length > 0}
        aria-describedby={describedByIds(id, hint, errors, notes)}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <label htmlFor={id}>{label}</label>
      <FieldMessages id={id} hint={hint} errors={errors} notes={notes} />
    </div>
  );
}
