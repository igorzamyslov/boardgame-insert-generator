// src/kit/Card.tsx
import type {
  ButtonHTMLAttributes,
  ComponentChildren,
  HTMLAttributes,
  MouseEventHandler,
} from "preact";
import { cx } from "./cx";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "disabled"> {
  children: ComponentChildren;
  class?: string;
}

/** A bordered card on the row colour (Main's box card). A button when it opens something. */
export function Card({ children, class: extra, onClick, ...rest }: CardProps) {
  if (onClick !== undefined) {
    return (
      <button
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        type="button"
        class={cx("k-card", "k-card--button", extra)}
        onClick={onClick as MouseEventHandler<HTMLButtonElement>}
      >
        {children}
      </button>
    );
  }
  return (
    <div {...(rest as HTMLAttributes<HTMLDivElement>)} class={cx("k-card", extra)}>
      {children}
    </div>
  );
}
