/** Code-unit string order: the same on every machine and locale, unlike `localeCompare`. */
export function compareCodeUnits(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

/**
 * Order for names a person reads: runs of digits count by value ("Cards 2" before "Cards 10",
 * "Deck 02" beside "Deck 2"), other text without regard to case. Ties fall back to code-unit
 * order, so the result is total and the same on every machine and locale.
 */
export function compareNatural(a: string, b: string): number {
  const chunks = (s: string): string[] => s.match(/\d+|\D+/g) ?? [];
  const as = chunks(a);
  const bs = chunks(b);
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    const x = as[i] ?? "";
    const y = bs[i] ?? "";
    let c: number;
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const nx = x.replace(/^0+(?=\d)/, "");
      const ny = y.replace(/^0+(?=\d)/, "");
      c = nx.length !== ny.length ? nx.length - ny.length : compareCodeUnits(nx, ny);
    } else {
      c = compareCodeUnits(x.toLowerCase(), y.toLowerCase());
    }
    if (c !== 0) {
      return sign(c);
    }
  }
  return as.length !== bs.length ? sign(as.length - bs.length) : compareCodeUnits(a, b);
}
