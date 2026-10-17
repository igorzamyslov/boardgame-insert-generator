// src/ui/components/test-editors.tsx
// Test-only: what the editors' tests share (a component of a kind, the last value a callback got,
// and the clicks that open More options and the rows under it).
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

/** More options, opened (left as it is when it is open already). */
export function openMore(): void {
  const more = screen.getByRole("button", { name: /^More options/ });
  if (more.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(more);
  }
}

/** Every row under More options that opens its exact values, opened. */
export function openRows(): void {
  openMore();
  for (const row of document.querySelectorAll<HTMLElement>(".k-drow")) {
    if (row.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(row);
    }
  }
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
