import type { Project } from "./types";

/**
 * JSON with object keys sorted at every level, so key order never changes the
 * hash. Arrays keep their order. `undefined` properties are skipped, as in
 * JSON.stringify.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v ?? null)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Deep copy without any `name` property (component, deck, item and figure names). */
function withoutNames(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutNames);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k !== "name") {
        // defineProperty, not assignment: an own "__proto__" field must be copied, not become the prototype.
        Object.defineProperty(out, k, {
          value: withoutNames(v),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return out;
  }
  return value;
}

/** cyrb53 (public domain, bryc): fast 53-bit string hash. Not cryptographic. */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Hash of everything that affects the layout (spec §5 StoredLayout.inputsHash):
 * box, printer, settings, components and locks. Names are left out, so renaming never
 * triggers a re-optimize. `separators` is in: above 1 it makes a stretched deck's slack a spacer
 * instead of a spare pocket, so it changes the stored layout. `settings.infill` is out: it only
 * changes the displayed filament estimate, so editing it never marks the plan stale. Project id, name, schemaVersion,
 * createdWith and the stored layout itself are left out too. Unknown fields
 * preserved from a newer-minor file are included as-is. 14 hex characters.
 */
export function inputsHash(p: Project): string {
  // infill only scales the filament estimate; no part depends on it, so it must not stale the plan.
  const settings = { ...p.settings, infill: undefined }; // canonicalJson skips undefined
  const canonical = canonicalJson({
    box: p.box,
    printer: p.printer,
    settings,
    components: withoutNames(p.components),
    locks: p.locks,
  });
  return cyrb53(canonical).toString(16).padStart(14, "0");
}
