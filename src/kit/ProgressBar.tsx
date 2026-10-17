// src/kit/ProgressBar.tsx

export interface ProgressBarProps {
  /** 0 to 100. */
  value: number;
  /** The bar's name for assistive technology. */
  label: string;
}

/** Exporting's bar: a pill track and an ink bar. */
export function ProgressBar({ value, label }: ProgressBarProps) {
  const now = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      class="k-progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={now}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div class="k-progress__bar" style={`width: ${now}%`} />
    </div>
  );
}
