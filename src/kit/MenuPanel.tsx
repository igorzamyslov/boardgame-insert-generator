// src/kit/MenuPanel.tsx
import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import { useBlocked } from "./blocked";
import { cx } from "./cx";

export interface MenuPanelProps {
  /** The panel's name ("Project"). */
  label: string;
  /** The panel's `data-region`, for the screenshots. */
  region?: string;
  children: ComponentChildren;
}

/**
 * Main's menu panel: 260 px, a shadow, a column of buttons. It is a disclosure panel, not an ARIA
 * menu (DESIGN §7): plain buttons that Tab reaches, so no `role="menu"` and no arrow keys.
 */
export function MenuPanel({ label, region, children }: MenuPanelProps) {
  return (
    <div class="k-menu" role="group" aria-label={label} data-region={region}>
      {children}
    </div>
  );
}

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  /** On the right, 13 px muted ("3 in this browser"). */
  meta?: string;
  /** Present: the item is blocked (`aria-disabled`), still focusable, and this says why. */
  blockedReason?: string;
  children: ComponentChildren;
}

/** A 44 px row of the menu. */
export function MenuItem({
  meta,
  blockedReason,
  children,
  type = "button",
  onClick,
  class: extra,
  ...rest
}: MenuItemProps) {
  const blocked = useBlocked(blockedReason, onClick);
  return (
    <>
      <button
        {...rest}
        {...blocked.props}
        type={type}
        class={cx("k-menu__item", extra as string | undefined)}
      >
        {children}
        {/* a space in the name between the words and the meta; in the flex row it takes no room */}
        {meta !== undefined ? " " : null}
        {meta !== undefined ? <span class="k-menu__meta">{meta}</span> : null}
      </button>
      {blocked.reason}
    </>
  );
}

export interface MenuLinkProps {
  href: string;
  children: ComponentChildren;
}

/** A row of the menu that leaves for another page: the same 44 px as an item, a link. */
export function MenuLink({ href, children }: MenuLinkProps) {
  return (
    <a href={href} class="k-menu__item">
      {children}
    </a>
  );
}

/** A 1 px rule between groups of items. */
export function MenuSeparator() {
  return <span class="k-menu__sep" aria-hidden="true" />;
}
