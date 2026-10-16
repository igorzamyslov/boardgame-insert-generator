// src/kit/Button.tsx
import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import { useBlocked } from "./blocked";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "soft";
export type ButtonSize = "control" | "dialog" | "cta";

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "size" | "icon" | "disabled"
> {
  /** Primary: ink fill. Secondary: a sheet with a line. Quiet: no fill. Soft: the page's colour. */
  variant?: ButtonVariant;
  /** `control` is 44 px, `dialog` 48 px, `cta` 54 px and 16 px type. */
  size?: ButtonSize;
  /** Present: the button is blocked (`aria-disabled`), still focusable, and this says why. */
  blockedReason?: string;
  /** A press while blocked (the button does nothing else): it may show the way out. */
  onBlockedClick?: () => void;
  /** An icon before the words, drawn by the caller (see `Icon`). */
  icon?: ComponentChildren;
  children?: ComponentChildren;
}

/** A pill button, as the boards draw it. */
export function Button({
  variant = "secondary",
  size = "control",
  blockedReason,
  onBlockedClick,
  icon,
  children,
  class: extra,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  const blocked = useBlocked(blockedReason, onClick, onBlockedClick);
  return (
    <>
      <button
        {...rest}
        {...blocked.props}
        type={type}
        class={cx("k-btn", `k-btn--${variant}`, `k-btn--${size}`, extra as string | undefined)}
      >
        {icon}
        {children}
      </button>
      {blocked.reason}
    </>
  );
}
