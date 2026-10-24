// src/viewer/colors.ts
// How the 3D view turns the plan's colours (plain sRGB hex) into what the renderer draws, and the
// lights that put a part's top face back to that colour. Kept apart from scene.ts, which needs a
// WebGL context, so the colour work is tested with the real three.js Color and no renderer.
import { Color, SRGBColorSpace } from "three";

/**
 * A shade as a lit surface needs it: the dark-scheme shades are lifted so the shading shows.
 *
 * The lightness is judged, and lifted, in sRGB, the space the shades are written in. three.js
 * keeps colours linear (`ColorManagement`), and `getHSL` and `setHSL` take the working space unless
 * told otherwise: in linear light even the plan's pale fills (#74C2B8 is 0.36) look "dark", and
 * lifting them by 0.25 turned every tray nearly white before any light touched it.
 */
export function litColor(css: string): Color {
  const c = new Color(css);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, SRGBColorSpace);
  return hsl.l < 0.4 ? c.setHSL(hsl.h, Math.min(1, hsl.s + 0.1), hsl.l + 0.25, SRGBColorSpace) : c;
}

/** A colour as "#rrggbb" (sRGB), for the shots window. */
export function hexOf(c: Color): string {
  return "#".concat(c.getHexString(SRGBColorSpace));
}

/**
 * `target` set to `base` moved `share` (0..1) of the way toward `page`, blended in sRGB as the plan
 * blends a dimmed tile with the page behind it (a blend in linear light is lighter and greyer).
 */
export function fadedColor(target: Color, base: Color, page: Color, share: number): Color {
  const a = { r: 0, g: 0, b: 0 };
  const b = { r: 0, g: 0, b: 0 };
  base.getRGB(a, SRGBColorSpace);
  page.getRGB(b, SRGBColorSpace);
  return target.setRGB(
    a.r + (b.r - a.r) * share,
    a.g + (b.g - a.g) * share,
    a.b + (b.b - a.b) * share,
    SRGBColorSpace,
  );
}

/** Where the sun is, as a direction from the middle of the box (y toward the front, z up). */
export const SUN_DIRECTION = { x: -1, y: -2, z: 3 } as const;

/** The ambient light's intensity: what the faces turned from the sun are lit with. */
export const AMBIENT_INTENSITY = 1.2;

/**
 * The sun's intensity, set so a face turned straight up is lit to exactly its own colour: a diffuse
 * surface returns (ambient + sun × cos) / π of its colour, and π is the whole of it. A pale plan
 * fill then reads as that fill on every top face, the sides fall away to the ambient's share, and
 * nothing is over-lit to white.
 */
export const SUN_INTENSITY =
  (Math.PI - AMBIENT_INTENSITY) /
  (SUN_DIRECTION.z / Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z));

/** The share of its colour a diffuse face with unit normal `n` returns under these lights. */
export function litShare(n: readonly [number, number, number]): number {
  const len = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  const cos = Math.max(
    0,
    (n[0] * SUN_DIRECTION.x + n[1] * SUN_DIRECTION.y + n[2] * SUN_DIRECTION.z) / len,
  );
  return (AMBIENT_INTENSITY + SUN_INTENSITY * cos) / Math.PI;
}
