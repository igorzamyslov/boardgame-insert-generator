// src/kit/MenuPanel.tsx
import type { ButtonHTMLAttributes, ComponentChildren } from "preact";

export interface MenuPanelProps {
  /** The panel's name ("Project"). */
  label: string;
  children: ComponentChildren;
}

/**
 * Main's menu panel: 260 px, a shadow, a column of buttons. It is a disclosure panel, not an ARIA
 * menu (DESIGN §7): plain buttons that Tab reaches, so no `role="menu"` and no arrow keys.
 */
export function MenuPanel({ label, children }: MenuPanelProps) {
  return (
    <div class="k-menu" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  /** On the right, 13 px muted ("3 in this browser"). */
  meta?: string;
  children: ComponentChildren;
}

/** A 44 px row of the menu. */
export function MenuItem({ meta, children, type = "button", ...rest }: MenuItemProps) {
  return (
    <button {...rest} type={type} class="k-menu__item">
      {children}
      {meta !== undefined ? <span class="k-menu__meta">{meta}</span> : null}
    </button>
  );
}

/** A 1 px rule between groups of items. */
export function MenuSeparator() {
  return <span class="k-menu__sep" aria-hidden="true" />;
}
