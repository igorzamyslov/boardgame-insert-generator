// src/ui/estimates.ts
// How the app writes a rough figure (DESIGN §2 Claims): "about 560 g".
// The words say "about" (owner decision), never "≈"; no gloss follows them. The app gives no print
// time: it depends on the printer, and a figure the app cannot know is not given (DESIGN §7).

/** Filament in whole grams, at least 1: "about 560 g". */
export function formatGrams(grams: number): string {
  return `about ${Math.max(1, Math.round(grams))} g`;
}
