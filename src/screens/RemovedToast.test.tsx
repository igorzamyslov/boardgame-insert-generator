// src/screens/RemovedToast.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemovedToast, removedWords } from "./RemovedToast";

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
