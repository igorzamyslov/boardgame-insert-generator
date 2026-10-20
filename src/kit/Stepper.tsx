// src/kit/Stepper.tsx
import { useId } from "preact/hooks";
import { numberInputAttrs, useNumberText } from "../ui/NumberField";
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
  /** The id of words that say what is wrong with the value from outside (the engine's error under it). */
  describedBy?: string;
  /** The count is refused from outside: it is marked invalid, and `describedBy` says why. */
  invalid?: boolean;
}

/**
 * Fewer, a count you can type in, More: the board's "How many". A typed count the rules refuse is
 * kept, with the words of what is wrong under it, until it is mended; it never commits.
 */
export function Stepper({
  label,
  value,
  min = 0,
  max,
  onChange,
  minReason = "That is the fewest it can be.",
  maxReason = "That is the most it can be.",
  describedBy,
  invalid = false,
}: StepperProps) {
  const typed = useNumberText(value, onChange, { integer: true, min, max });
  const errorId = useId();
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  return (
    <div class="k-stepper-box">
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
          aria-invalid={typed.error === null && !invalid ? undefined : true}
          aria-describedby={
            [typed.error === null ? undefined : errorId, describedBy].filter(Boolean).join(" ") ||
            undefined
          }
          value={typed.text}
          onInput={(e) => typed.onInput(e.currentTarget.value)}
          onBlur={typed.onBlur}
          onKeyDown={typed.onKeyDown}
        />
        <IconButton
          label="More"
          variant="outlined"
          icon={<Icon name="plus" size={14} />}
          blockedReason={atMax ? maxReason : undefined}
          onClick={() => onChange(value + 1)}
        />
      </div>
      {typed.error === null ? null : (
        <p class="k-field__error" id={errorId} role="alert">
          {typed.error}
        </p>
      )}
    </div>
  );
}
