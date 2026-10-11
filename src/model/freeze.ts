/**
 * Freezes a value and everything nested in it, so shared constants cannot be
 * changed by aliasing. Returns the value with its declared type unchanged.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    const children: unknown[] = Object.values(value);
    for (const child of children) {
      deepFreeze(child);
    }
  }
  return value;
}
