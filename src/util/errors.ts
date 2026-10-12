// src/util/errors.ts
/** A caught value as a message: the one place that does it, shared by the app's orchestrators. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
