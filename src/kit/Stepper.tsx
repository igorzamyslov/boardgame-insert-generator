// src/kit/Stepper.tsx
import { useEffect, useState } from "preact/hooks";
import { numberInputAttrs } from "../ui/NumberField";
import { IconButton } from "./IconButton";
import { Icon } from "./icons";

export interface StepperProps {
  /** The count's name for assistive technology ("Number of cards"). */
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  /** Why Fewer is blocked at the lowest count. */
  minReason?: string;
  /** Why More is blocked at the highest count. */
  maxReason?: string;
}

/** Fewer, a count you can type in, More: the board's "How many". */
export function Stepper({
  label,
  value,
  min = 0,
  max,
  onChange,
  minReason = "That is the fewest it can be.",
  maxReason = "That is the most it can be.",
}: StepperProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  const inRange = (n: number): boolean => n >= min && (max === undefined || n <= max);
  return (
    <div class="k-stepper">
      <IconButton
        label="Fewer"
        variant="outlined"
        icon={<Icon name="minus" size={14} />}
        blockedReason={atMin ? minReason : undefined}
        onClick={() => onChange(value - 1)}
      />
      <input
        class="k-stepper__input"
        type="text"
        autoComplete="off"
        {...numberInputAttrs(true)}
        aria-label={label}
        value={text}
        onInput={(e) => {
          const next = e.currentTarget.value;
          setText(next);
          const n = Number(next.trim());
          if (next.trim() !== "" && Number.isInteger(n) && inRange(n) && n !== value) {
            onChange(n);
          }
        }}
        onBlur={() => setText(String(value))}
      />
      <IconButton
        label="More"
        variant="outlined"
        icon={<Icon name="plus" size={14} />}
        blockedReason={atMax ? maxReason : undefined}
        onClick={() => onChange(value + 1)}
      />
    </div>
  );
}
