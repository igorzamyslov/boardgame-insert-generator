export type Json = Record<string, unknown>;

export function isRecord(x: unknown): x is Json {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** RFC 6901 JSON pointer → keys: "/settings/lip/play" → ["settings", "lip", "play"]. */
export function pointerKeys(path: string): string[] {
  return path
    .split("/")
    .slice(1)
    .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** One key as a JSON pointer segment (RFC 6901): "a/b~c" → "a~1b~0c". The inverse of pointerKeys. */
export function escapePointerKey(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** True for a canonical array index as a pointer key: "0", "12", but not "01", "-1" or "1.5". */
export function isArrayIndex(key: string): boolean {
  return /^(0|[1-9]\d*)$/.test(key);
}

/**
 * The value at `keys` inside plain JSON data, or undefined. Follows own
 * properties and array indices only, so "constructor", "__proto__" or "length"
 * never reach inherited or built-in members.
 */
export function valueAt(root: unknown, keys: string[]): unknown {
  let node = root;
  for (const k of keys) {
    if (Array.isArray(node)) {
      if (!isArrayIndex(k)) {
        return undefined;
      }
      node = node[Number(k)];
    } else if (isRecord(node) && Object.hasOwn(node, k)) {
      node = node[k];
    } else {
      return undefined;
    }
  }
  return node;
}

/** Deepest nesting a project file may have. A real project is under 10 levels deep. */
export const MAX_JSON_DEPTH = 64;

/**
 * True when `value` has containers (objects or arrays) nested more than `max`
 * levels deep: `{a: 1}` is 1 level, `{a: [1]}` is 2. Iterative, so hostile
 * depth can't overflow the call stack, as the recursive structuredClone, hash
 * and serialize code run later would.
 */
export function jsonDepthExceeds(value: unknown, max: number): boolean {
  const pending: [unknown, number][] = [[value, 0]];
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    const [node, depth] = item;
    if (typeof node !== "object" || node === null) {
      continue;
    }
    if (depth + 1 > max) {
      return true;
    }
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      pending.push([child, depth + 1]);
    }
  }
  return false;
}

const MAX_SHOWN = 40;

/** Text from the file for a message, cut to 40 characters so messages stay short. */
export function shorten(text: string): string {
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text;
}

/** `shorten`, in double quotes. */
export function quote(text: string): string {
  return JSON.stringify(shorten(text));
}

/** "a; b; c; and 2 more". `omitted` counts problems the caller dropped beyond those in the list. */
export function summarize(problems: string[], omitted = 0): string {
  const shown = problems.slice(0, 3).join("; ");
  const more = Math.max(problems.length - 3, 0) + omitted;
  return more > 0 ? `${shown}; and ${more} more` : shown;
}
