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

/** The value at `keys` inside plain JSON data, or undefined. */
export function valueAt(root: unknown, keys: string[]): unknown {
  let node = root;
  for (const k of keys) {
    if (Array.isArray(node)) {
      node = node[Number(k)];
    } else if (isRecord(node)) {
      node = node[k];
    } else {
      return undefined;
    }
  }
  return node;
}

/** "a; b; c; and 2 more" */
export function summarize(problems: string[]): string {
  const shown = problems.slice(0, 3).join("; ");
  return problems.length > 3 ? `${shown}; and ${problems.length - 3} more` : shown;
}
