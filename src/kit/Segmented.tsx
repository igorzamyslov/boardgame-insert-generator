// src/kit/Segmented.tsx
import { cx } from "./cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  /** The group's name ("Layer"). */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `quiet` sits on `--fill-quiet` (Edit, Box, Settings); `track` on `--track` (Main's Layer and View). */
  tone?: "quiet" | "track";
  /** Every option takes an equal share of the width (Edit's Sleeves), not just its own. */
  stretch?: boolean;
}

/** One of a few choices, in a pill track: the pressed one is a raised thumb. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  tone = "quiet",
  stretch = false,
}: SegmentedProps<T>) {
  return (
    <div
      class={cx("k-seg", stretch && "k-seg--stretch")}
      role="group"
      aria-label={label}
      data-tone={tone}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          class="k-seg__item"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
