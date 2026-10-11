const MAX_NAME = 60;

const TRANSLITERATE: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
  æ: "ae",
  Æ: "Ae",
  ø: "o",
  Ø: "O",
  œ: "oe",
  Œ: "Oe",
};

// "NN-<contents>.ext": contents transliterated to ASCII (umlauts → ae/oe/ue,
// accents dropped), everything outside [A-Za-z0-9._-] turned into "-",
// repeats collapsed, trimmed, at most 60 characters; "part" if nothing is
// left. NN is the index padded to two digits.
export function partFileName(index: number, contents: string, ext: "3mf" | "stl"): string {
  const ascii = [...contents]
    .map((ch) => TRANSLITERATE[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const cleaned = ascii
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/([._-])[._-]+/g, "$1")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, MAX_NAME)
    .replace(/[._-]+$/g, "");
  const prefix = String(Math.max(0, Math.trunc(index))).padStart(2, "0");
  return `${prefix}-${cleaned === "" ? "part" : cleaned}.${ext}`;
}
