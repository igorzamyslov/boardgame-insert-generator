// src/kit/IconTile.tsx
import type { ComponentChildren } from "preact";
import type { ComponentKind } from "../model/types";
import { cx } from "./cx";
import { KindGlyph } from "./icons";

export type IconTileSize = 34 | 36 | 40 | 44;

export interface IconTileProps {
  /** Side in px; the corner radius follows the boards (9, 10, 10, 12). */
  size: IconTileSize;
  /** The kind's fill and ink, and its glyph when no children are given. */
  kind?: ComponentKind;
  /** The kind's line round the tile, 2 px (MobileTray's header). */
  lined?: boolean;
  /** An icon of the caller's, on the kind's colours or on the neutral ground. */
  children?: ComponentChildren;
}

/** A rounded square with an icon in it, hidden from assistive technology. */
export function IconTile({ size, kind, lined = false, children }: IconTileProps) {
  const glyph = Math.round(size / 2);
  return (
    <span
      class={cx("k-tile", `k-tile--${size}`, lined && "k-tile--lined")}
      data-kind={kind}
      aria-hidden="true"
    >
      {children ?? (kind !== undefined ? <KindGlyph kind={kind} size={glyph} /> : null)}
    </span>
  );
}
