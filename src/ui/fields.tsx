// src/ui/fields.tsx
import { useEffect, useState } from "preact/hooks";
import { FieldMessages, describedByIds, messagesOf } from "./FieldMessages";
import { useFieldNotices } from "./validation";

function describedBy(...ids: (string | null)[]): string | undefined {
  const joined = ids.filter((x): x is string => x !== null).join(" ");
  return joined === "" ? undefined : joined;
}

export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
  hint?: string;
  path?: string;
  placeholder?: string;
  commitOn?: "input" | "blur";
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
}: TextFieldProps) {
  const [text, setText] = useState(value);
  const notices = useFieldNotices(path);
  useEffect(() => {
    setText(value);
  }, [value]);
  const { errors, notes } = messagesOf(notices);
  function commitPending(): void {
    if (commitOn === "blur" && text !== value) {
      onCommit(text);
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
}

export interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
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
        aria-describedby={describedBy(hintId)}
        onChange={(e) => {
          const picked = options.find((o) => o.value === e.currentTarget.value);
          if (picked) {
            onChange(picked.value);
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
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
}

export function CheckField({ id, label, checked, onChange, disabled, hint }: CheckFieldProps) {
  const hintId = hint !== undefined ? `${id}-hint` : null;
  return (
    <div class="check-field">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy(hintId)}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hintId !== null ? (
        <p class="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
