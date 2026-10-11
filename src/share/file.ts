import { parseProject, toSerializable } from "../model/schema";
import type { ForeignData, ParseResult, Project } from "../model/types";
import { MAX_INFLATED_BYTES } from "./link";

/** Project file contents: pretty-printed JSON, so people can read and diff it. */
export function exportJsonFile(p: Project, foreign: ForeignData): Blob {
  const json = `${JSON.stringify(toSerializable(p, foreign), null, 2)}\n`;
  return new Blob([json], { type: "application/json" });
}

/** "My Game!" → "My-Game.insert.json"; only [A-Za-z0-9._-] survive. */
export function jsonFileName(p: Project): string {
  const base = p.name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${base || "insert"}.insert.json`;
}

/**
 * Reads an imported file's text. Same 1 MB cap and bounds as links. A UTF-8
 * byte order mark (added by some Windows editors) is ignored.
 */
export function importJsonText(text: string): ParseResult {
  if (text.length > MAX_INFLATED_BYTES) {
    return { ok: false, error: "This file is larger than 1 MB, which is over the limit." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, error: "This file isn't valid JSON, so it can't be a project file." };
  }
  return parseProject(raw);
}
