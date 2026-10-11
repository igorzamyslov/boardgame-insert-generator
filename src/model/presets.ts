/** Card sizes (card, not sleeve), spec §5. shortSide ≤ longSide. */
export const CARD_PRESETS: { id: string; label: string; shortSide: number; longSide: number }[] = [
  { id: "standard", label: "Standard", shortSide: 63.5, longSide: 88 },
  { id: "standard-american", label: "Standard American", shortSide: 56, longSide: 87 },
  { id: "euro", label: "Euro", shortSide: 59, longSide: 92 },
  { id: "mini-euro", label: "Mini Euro", shortSide: 44, longSide: 68 },
  { id: "mini-american", label: "Mini American", shortSide: 41, longSide: 63 },
  { id: "tarot", label: "Tarot", shortSide: 70, longSide: 120 },
  { id: "french-tarot", label: "French Tarot", shortSide: 61, longSide: 112 },
  { id: "extra-large", label: "Extra Large", shortSide: 65, longSide: 100 },
  { id: "dixit", label: "Dixit", shortSide: 80, longSide: 120 },
];

/**
 * Sleeve table, spec §5: thickness added per card, and length added to both the
 * short and the long side. Custom sleeves give their outer size directly.
 */
export const SLEEVES: Record<
  "none" | "standard" | "premium",
  { addThickness: number; addSize: number }
> = {
  none: { addThickness: 0, addSize: 0 },
  standard: { addThickness: 0.1, addSize: 3 },
  premium: { addThickness: 0.28, addSize: 3 },
};

/** Print bed presets, spec §5. The UI adds "custom". */
export const BED_PRESETS: {
  id: string;
  label: string;
  bedX: number;
  bedY: number;
  bedZ: number;
}[] = [
  { id: "bambu-256", label: "Bambu Lab (256 × 256 × 256)", bedX: 256, bedY: 256, bedZ: 256 },
  { id: "prusa-mk4", label: "Prusa MK4 (250 × 210 × 220)", bedX: 250, bedY: 210, bedZ: 220 },
  { id: "ender-3", label: "Ender 3 (220 × 220 × 250)", bedX: 220, bedY: 220, bedZ: 250 },
];
