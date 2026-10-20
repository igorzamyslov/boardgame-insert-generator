// src/kit/KindTile.tsx
import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import type { ComponentKind } from "../model/types";
import { cx } from "./cx";
import { GroupGlyph } from "./icons";
import { IconTile } from "./IconTile";

export interface KindTileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  /** A kind of item, or "group": Add's sixth tile, in a neutral tile with the group glyph. */
  kind: ComponentKind | "group";
  children: ComponentChildren;
}

/** A 56 px button with a kind's icon tile and its name: Empty's "Cards", "Tokens and dice"; Add's "Group". */
export function KindTile({
  kind,
  children,
  class: extra,
  type = "button",
  ...rest
}: KindTileProps) {
  return (
    <button {...rest} type={type} class={cx("k-kindtile", extra as string | undefined)}>
      {kind === "group" ? (
        <IconTile size={34} tone="group">
          <GroupGlyph size={17} />
        </IconTile>
      ) : (
        <IconTile size={34} kind={kind} />
      )}
      <span class="k-kindtile__name">{children}</span>
    </button>
  );
}
