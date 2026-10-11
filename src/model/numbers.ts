/**
 * One optional sign, digits, and at most one decimal separator (comma or
 * point). No thousands separators, exponents, units or inner spaces.
 */
const NUMBER = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * Parses a number typed by the user, with a decimal comma or point (spec §8.2).
 * Returns null for anything it can't read unambiguously, so the field can show
 * an error instead of silently using a wrong value:
 *
 * - "63,5" and "63.5" → 63.5; " 63,5 " → 63.5 (outer whitespace is ignored)
 * - "−2" (Unicode minus) → −2
 * - "1.000,5", "1,000.5", "1 000", "1e3", "63,5 mm", "" → null
 *
 * "1.000" and "1,000" both read as 1: a single separator is always decimal.
 * Lengths are capped at 1000 mm, so "one thousand" typed with a thousands
 * separator is unlikely, and validation shows the result next to the field.
 */
export function parseNumber(text: string): number | null {
  const s = text.trim().replace(/−/g, "-");
  if (!NUMBER.test(s)) {
    return null;
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
