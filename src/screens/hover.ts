// src/screens/hover.ts
import { signal } from "@preact/signals";

/**
 * The component whose rail row the pointer or the keyboard focus is on, or null. The rail sets it
 * and the plan reads it, to light that component's trays and dim the rest (Main).
 */
export const hoveredComponent = signal<string | null>(null);
