// src/app/support.ts
import { KNOWN_COMPARTMENT_KINDS, KNOWN_FEATURE_TYPES, KNOWN_PARTS } from "../geometry/types";
import type { TraySpec } from "../model/types";

// Plan 3's lists (geometry/types has no WASM import, so the main bundle stays light).
const PARTS = new Set<string>(KNOWN_PARTS);
const KINDS = new Set<string>(KNOWN_COMPARTMENT_KINDS);
const FEATURES = new Set<string>(KNOWN_FEATURE_TYPES);

/** Why this app version can't build a stored tray (newer-minor files, spec §9), or null. */
export function unsupportedReason(spec: TraySpec): string | null {
  if (!PARTS.has(spec.part)) {
    return `Uses a tray type "${String(spec.part)}" from a newer app version.`;
  }
  // The part's own features (a card spacer's notch).
  for (const f of spec.features ?? []) {
    if (!FEATURES.has(f.type)) {
      return `Uses feature "${String(f.type)}" from a newer app version.`;
    }
  }
  for (const c of spec.compartments) {
    if (!KINDS.has(c.kind)) {
      return `Uses compartment kind "${String(c.kind)}" from a newer app version.`;
    }
    for (const f of c.features) {
      if (!FEATURES.has(f.type)) {
        return `Uses feature "${String(f.type)}" from a newer app version.`;
      }
    }
  }
  // A merged part is as buildable as its members.
  for (const member of spec.merged?.members ?? []) {
    const reason = unsupportedReason(member);
    if (reason !== null) {
      return reason;
    }
  }
  return null;
}

/**
 * Readable reason for a failed mesh build. The geometry client rejects with a
 * GeometryBuildError whose `name` is the reason (roadmap §4.3); it is matched by name, so this
 * module never imports the client.
 */
export function buildErrorReason(e: unknown): string {
  if (!(e instanceof Error)) {
    return String(e);
  }
  switch (e.name) {
    case "UnsupportedFeatureError": {
      const feature = (e as { feature?: unknown }).feature;
      return `Uses feature "${typeof feature === "string" ? feature : "?"}" from a newer app version.`;
    }
    case "TimeoutError":
      return "Building this tray took too long.";
    case "AbortError":
      return "Cancelled.";
    default:
      // "TraySpecError" (an invalid spec: "Tray <key>: …"), worker failures and anything else.
      return e.message;
  }
}

/** Whether a build failed because the spec is invalid (planTray's TraySpecError), by name. */
export function isInvalidSpec(e: unknown): boolean {
  return e instanceof Error && e.name === "TraySpecError";
}
