// src/kit/KindTile.tsx
import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import type { ComponentKind } from "../model/types";
import { cx } from "./cx";
import { IconTile } from "./IconTile";

export interface KindTileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  kind: ComponentKind;
  children: ComponentChildren;
}

/** A 56 px button with a kind's icon tile and its name: Empty's "Cards", "Tokens and dice". */
export function KindTile({
  kind,
  children,
  class: extra,
  type = "button",
  ...rest
}: KindTileProps) {
  return (
    <button {...rest} type={type} class={cx("k-kindtile", extra as string | undefined)}>
      <IconTile size={34} kind={kind} />
      <span class="k-kindtile__name">{children}</span>
    </button>
  );
}
