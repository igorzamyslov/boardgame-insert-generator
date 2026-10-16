// src/kit/IconButton.tsx
import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import { useBlocked } from "./blocked";
import { cx } from "./cx";
import { Icon } from "./icons";

export type IconButtonVariant = "plain" | "outlined" | "soft" | "primary";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "icon" | "disabled" | "label"
> {
  /** What the button does: its accessible name. */
  label: string;
  variant?: IconButtonVariant;
  /** A warning dot at the top right (the project menu's). */
  dot?: boolean;
  /** Present: blocked, still focusable, and this says why. */
  blockedReason?: string;
  /** The icon, drawn by the caller (see `Icon`). */
  icon: ComponentChildren;
}

/** A 44 px round button with an icon and no words. */
export function IconButton({
  label,
  variant = "plain",
  dot = false,
  blockedReason,
  icon,
  class: extra,
  onClick,
  type = "button",
  ...rest
}: IconButtonProps) {
  const blocked = useBlocked(blockedReason, onClick);
  return (
    <>
      <button
        {...rest}
        {...blocked.props}
        type={type}
        aria-label={label}
        class={cx("k-iconbtn", `k-iconbtn--${variant}`, extra as string | undefined)}
      >
        {icon}
        {dot ? <span class="k-iconbtn__dot" aria-hidden="true" /> : null}
      </button>
      {blocked.reason}
    </>
  );
}

/** The soft round × that closes a dialog or a drawer. */
export function CloseButton({
  onClick,
  label = "Close",
}: {
  onClick?: () => void;
  label?: string;
}) {
  return (
    <IconButton
      label={label}
      variant="soft"
      icon={<Icon name="close" size={14} />}
      onClick={onClick}
    />
  );
}
