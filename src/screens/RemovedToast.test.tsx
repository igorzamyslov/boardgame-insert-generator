// src/screens/RemovedToast.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemovedToast, groupRemovedWords, removedWords } from "./RemovedToast";

afterEach(cleanup);

describe("RemovedToast", () => {
  it("says what went, in Edit's toast, with Undo removal and Dismiss as buttons", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <RemovedToast name="Market deck" onUndo={onUndo} onDismiss={onDismiss} />,
    );
    expect(container.querySelector(".k-toast")).not.toBeNull();
    expect(screen.getByText(removedWords("Market deck"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo removal" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("carries no live region of its own: the app's hidden one speaks the removal", () => {
    render(<RemovedToast name="Dial" onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(removedWords("Dial")).toBe("Removed “Dial”.");
  });
});

describe("a group's removal", () => {
  const notes = ["Player kit removed. Its items are back in the list."];

  it("says the group's own note, then what the rules lost as sentences of their own", () => {
    expect(groupRemovedWords(notes)).toBe("Player kit removed. Its items are back in the list.");
    expect(groupRemovedWords([...notes, "2 pins removed", "Size unlocked on 1 tray"])).toBe(
      "Player kit removed. Its items are back in the list. 2 pins removed. Size unlocked on 1 tray.",
    );
  });

  it("is the toast's words, with the same Undo removal and Dismiss", () => {
    const onUndo = vi.fn();
    render(<RemovedToast words={groupRemovedWords(notes)} onUndo={onUndo} onDismiss={vi.fn()} />);
    expect(screen.getByText(/^Player kit removed\. Its items are back in the list\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
