// src/kit/cx.ts

/** A class list from the names that are set: `cx("k-btn", on && "is-on", undefined)` is "k-btn is-on". */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter((n): n is string => typeof n === "string" && n !== "").join(" ");
}
