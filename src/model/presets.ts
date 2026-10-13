import { deepFreeze } from "./freeze";

export interface CardPreset {
  id: string;
  label: string;
  shortSide: number;
  longSide: number;
  /** Shown first in the card size choice; the rest are listed by size under "Other sizes". */
  common?: boolean;
}

export interface BedPreset {
  id: string;
  /** The size: what the choice is made on. */
  label: string;
  /** Printers with this bed, a hint shown once it is chosen. */
  examples: string;
  bedX: number;
  bedY: number;
  bedZ: number;
}

/** The standard card size: the default for new card components. Frozen. */
export const STANDARD_CARD: CardPreset = deepFreeze({
  id: "standard",
  label: "Standard",
  shortSide: 63.5,
  longSide: 88,
  common: true,
});

/** The Bambu Lab 256 mm bed: the default printer of new projects. Frozen. */
export const BAMBU_256_BED: BedPreset = deepFreeze({
  id: "bambu-256",
  label: "256 × 256 × 256 mm",
  examples: "Bambu Lab X1, P1 and A1",
  bedX: 256,
  bedY: 256,
  bedZ: 256,
});

/** Card sizes (card, not sleeve), spec §5. shortSide ≤ longSide. Frozen. */
export const CARD_PRESETS: CardPreset[] = deepFreeze([
  STANDARD_CARD,
  {
    id: "standard-american",
    label: "Standard American",
    shortSide: 56,
    longSide: 87,
    common: true,
  },
  { id: "euro", label: "Euro", shortSide: 59, longSide: 92, common: true },
  { id: "mini-euro", label: "Mini Euro", shortSide: 44, longSide: 68, common: true },
  { id: "mini-american", label: "Mini American", shortSide: 41, longSide: 63 },
  { id: "tarot", label: "Tarot", shortSide: 70, longSide: 120, common: true },
  { id: "french-tarot", label: "French Tarot", shortSide: 61, longSide: 112 },
  { id: "extra-large", label: "Extra Large", shortSide: 65, longSide: 100 },
  { id: "dixit", label: "Dixit", shortSide: 80, longSide: 120 },
]);

/**
 * Sleeve table, spec §5: thickness added per card, and length added to both the
 * short and the long side. Custom sleeves give their outer size directly. Frozen.
 */
export const SLEEVES: Record<
  "none" | "standard" | "premium",
  { addThickness: number; addSize: number }
> = deepFreeze({
  none: { addThickness: 0, addSize: 0 },
  standard: { addThickness: 0.1, addSize: 3 },
  premium: { addThickness: 0.28, addSize: 3 },
});

/** Print bed presets, smallest first. The UI adds "custom". Frozen. */
export const BED_PRESETS: BedPreset[] = deepFreeze([
  {
    id: "bed-180",
    label: "180 × 180 × 180 mm",
    examples: "Bambu Lab A1 mini and Prusa MINI+",
    bedX: 180,
    bedY: 180,
    bedZ: 180,
  },
  {
    id: "ender-3",
    label: "220 × 220 × 250 mm",
    examples: "Creality Ender 3",
    bedX: 220,
    bedY: 220,
    bedZ: 250,
  },
  {
    id: "prusa-mk4",
    label: "250 × 210 × 220 mm",
    examples: "Prusa MK4",
    bedX: 250,
    bedY: 210,
    bedZ: 220,
  },
  BAMBU_256_BED,
  {
    id: "bed-300",
    label: "300 × 300 × 300 mm",
    examples: "Creality K1 Max",
    bedX: 300,
    bedY: 300,
    bedZ: 300,
  },
  {
    id: "bed-350",
    label: "350 × 350 × 350 mm",
    examples: "Voron 350 and other large printers",
    bedX: 350,
    bedY: 350,
    bedZ: 350,
  },
]);
