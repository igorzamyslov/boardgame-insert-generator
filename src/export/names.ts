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

// "<name>.ext": the part's name transliterated to ASCII (umlauts → ae/oe/ue,
// accents dropped), everything outside [A-Za-z0-9._-] turned into "-",
// repeats collapsed, trimmed, at most 60 characters; "part" if nothing is
// left. Parts are known by their names, so no number goes in front; two names
// can come out alike (the cleaning drops what it cannot write), so a caller
// that writes several files makes them unique (uniqueFileNames).
export function partFileName(name: string, ext: "3mf" | "stl"): string {
  const ascii = [...name]
    .map((ch) => TRANSLITERATE[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/([._-])[._-]+/g, "$1")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, MAX_NAME)
    .replace(/[._-]+$/g, "");
  return `${cleaned === "" ? "part" : cleaned}.${ext}`;
}

/**
 * The file names with a counter before the extension where one repeats an earlier one (compared
 * without case, as a file system may): "Dice.3mf", "Dice-2.3mf", "Dice-3.3mf".
 */
export function uniqueFileNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
      candidate = `${stem}-${n}${ext}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
