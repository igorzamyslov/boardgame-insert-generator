// src/kit/StepBadge.tsx

export interface StepBadgeProps {
  /** The step's number: steps, not tray numbers (a ruling). */
  n: number;
  /** The step being done: ink and white. The next one is the neutral ground. */
  active?: boolean;
}

/** A 26 px circle with a step's number, before its heading (Empty's "1" and "2"). */
export function StepBadge({ n, active = false }: StepBadgeProps) {
  return (
    <span class="k-step" data-active={active ? "" : undefined}>
      {n}
    </span>
  );
}
