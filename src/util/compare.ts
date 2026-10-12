/** Code-unit string order: the same on every machine and locale, unlike `localeCompare`. */
export function compareCodeUnits(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
