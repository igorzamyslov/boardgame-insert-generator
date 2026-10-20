// src/screens/hover.ts
import { signal } from "@preact/signals";

/**
 * The component whose rail row the pointer or the keyboard focus is on, or null. The rail sets it
 * and the plan reads it, to light that component's trays and dim the rest (Main).
 */
export const hoveredComponent = signal<string | null>(null);

/**
 * The items of a group whose card the pointer or the keyboard focus is on (its header or a member
 * row), or null. A group is one tray in the plan, per copy: pointing at any of its card lights
 * every tray of the group, so the plan and 3D read the members, not one item's id.
 */
export const hoveredMembers = signal<readonly string[] | null>(null);
