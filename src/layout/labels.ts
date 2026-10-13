import type { TrayRequirement } from "../sizing/types";
import type { Ctx } from "./context";

/** The distinct contents of a part, e.g. "Deck ×50", or its key when it names nothing. */
export function partLabel(contents: readonly string[], key: string): string {
  const names = [...new Set(contents.filter((c) => c !== ""))];
  return names.length > 0 ? names.join(", ") : key;
}

/** The contents of a requirement's first variant, or its key when it names nothing. */
export function requirementLabel(r: TrayRequirement): string {
  const names = new Set(
    (r.variants[0]?.parts ?? []).flatMap((p) => p.compartments.map((c) => c.contents)),
  );
  return names.size > 0 ? [...names].join(", ") : r.key;
}

/** What a notice calls a tray whose key no longer names anything: the key means nothing to a reader. */
export const REMOVED_TRAY = "a tray that no longer exists";

/**
 * What a user would call the tray with this key: its contents, e.g. "Deck ×50". A key the
 * layout does not know (the component was removed) reads as REMOVED_TRAY; a tray with no
 * contents text falls back to its key.
 */
export function trayLabel(ctx: Ctx, key: string): string {
  const ref = ctx.refsOfKey(key)[0];
  const part = ref ? ctx.part(ref) : undefined;
  if (!part) {
    return REMOVED_TRAY;
  }
  return partLabel(
    part.compartments.map((c) => c.contents),
    key,
  );
}
