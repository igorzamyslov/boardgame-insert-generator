// src/ui/estimates.ts
// How the app writes a rough figure (DESIGN §2 Claims): "about 560 g", "about 45 min", "about 3.5 h".
// The words say "about" (owner decision), never "≈"; no gloss follows them.

/** Filament in whole grams, at least 1: "about 560 g". */
export function formatGrams(grams: number): string {
  return `about ${Math.max(1, Math.round(grams))} g`;
}

/**
 * A rough duration: minutes (to 5) under an hour, else hours to the half hour. The model is too
 * loose for finer figures: "about 45 min", "about 3.5 h", "about 33 h".
 */
export function formatPrintTime(minutes: number): string {
  const nearest5 = Math.max(5, Math.round(minutes / 5) * 5);
  if (nearest5 < 60) {
    return `about ${nearest5} min`;
  }
  return `about ${Math.round((minutes / 60) * 2) / 2} h`;
}

/** One part's cost on a single line, time first, as Main's tray bar says it: "about 3.5 h, 58 g". */
export function formatPrintCost(minutes: number, grams: number): string {
  return `${formatPrintTime(minutes)}, ${Math.max(1, Math.round(grams))} g`;
}
