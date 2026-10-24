// src/ui/components/test-editors.tsx
// Test-only: what the editors' tests share (a component of a kind, the last value a callback got,
// and the clicks that open the rows of Tray settings).
import { fireEvent, screen } from "@testing-library/preact";
import { newComponent } from "../../model/defaults";
import type { Component } from "../../model/types";

export function of<K extends Component["kind"]>(kind: K): Extract<Component, { kind: K }> {
  const c = newComponent(kind);
  if (c.kind !== kind) {
    throw new Error(`expected ${kind}`);
  }
  return { ...(c as Extract<Component, { kind: K }>), id: "x1" };
}

export function lastOf<T>(fn: { mock: { calls: T[][] } }): T {
  const call = fn.mock.calls.at(-1);
  if (!call || call[0] === undefined) {
    throw new Error("not called");
  }
  return call[0];
}

/** The Tray settings rows, by the name a row has on screen. */
export type TrayRow = "Reach" | "Shape" | "Room" | "Copies and group";

/** A Tray settings row's button, or null when the editor draws none (Reach in a group, say). */
export function trayRow(title: TrayRow): HTMLElement | null {
  const rows = screen.queryAllByRole("button", { name: new RegExp(`^${title}`) });
  return rows.find((r) => r.classList.contains("k-drow")) ?? rows[0] ?? null;
}

/** The given Tray settings rows, opened (a row open already stays open; a row not drawn is skipped). */
export function openSettings(...titles: TrayRow[]): void {
  for (const title of titles) {
    const row = trayRow(title);
    if (row !== null && row.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(row);
    }
  }
}

/** Every Tray settings row, opened. */
export function openRows(): void {
  openSettings("Reach", "Shape", "Room", "Copies and group");
}

/** The label of the pressed button of a group of choices ("Sleeves"), or null when none is. */
export function pressedIn(group: string): string | null {
  const buttons = Array.from(screen.getByRole("group", { name: group }).querySelectorAll("button"));
  return buttons.find((b) => b.getAttribute("aria-pressed") === "true")?.textContent ?? null;
}

/** A button of a group of choices, by its label. */
export function choose(group: string, label: string): void {
  const buttons = Array.from(screen.getByRole("group", { name: group }).querySelectorAll("button"));
  const button = buttons.find((b) => b.textContent === label);
  if (button === undefined) {
    throw new Error(`${group} has no ${label}`);
  }
  fireEvent.click(button);
}
