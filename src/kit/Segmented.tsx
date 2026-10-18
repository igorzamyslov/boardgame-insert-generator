// src/kit/Segmented.tsx
import { useBlocked } from "./blocked";
import { cx } from "./cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Present: this option is blocked (`aria-disabled`, still focusable) and this says why (Main's "3D needs WebGL"). */
  blockedReason?: string;
  /** This value differs from its default (Settings' "Custom" wall): pressed, it is set in the changed ink. */
  changed?: boolean;
  /** The option's panel has a problem (a tab with an error): a dot after the label, and words for a reader. */
  attention?: boolean;
  /**
   * The option's panel holds a value that differs from its default (Settings' tabs): a dot in the
   * changed colour, and ", changed" for a reader. An `attention` dot wins: one dot, the error's.
   */
  changedDot?: boolean;
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
        <Item key={o.value} option={o} pressed={o.value === value} onPick={onChange} />
      ))}
    </div>
  );
}

function Item<T extends string>({
  option,
  pressed,
  onPick,
}: {
  option: SegmentedOption<T>;
  pressed: boolean;
  onPick: (value: T) => void;
}) {
  const blocked = useBlocked(option.blockedReason, () => onPick(option.value));
  return (
    <>
      <button
        type="button"
        class="k-seg__item"
        aria-pressed={pressed}
        data-changed={option.changed === true ? "" : undefined}
        title={option.blockedReason}
        {...blocked.props}
      >
        {option.label}
        {option.attention === true ? (
          <>
            <span class="visually-hidden">, needs attention</span>
            <span class="k-seg__dot" aria-hidden="true" />
          </>
        ) : option.changedDot === true ? (
          <>
            <span class="visually-hidden">, changed</span>
            <span class="k-seg__dot" data-tone="changed" aria-hidden="true" />
          </>
        ) : null}
      </button>
      {blocked.reason}
    </>
  );
}
