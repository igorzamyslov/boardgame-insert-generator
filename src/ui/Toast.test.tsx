// src/ui/Toast.test.tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_MS, Toast } from "./Toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast", () => {
  it("is a status region that holds the note", () => {
    render(<Toast message="Finger cuts added." onDone={() => undefined} />);
    expect(screen.getByRole("status").textContent).toBe("Finger cuts added.");
  });

  it("keeps the status region, empty, when there is no note", () => {
    render(<Toast message={null} onDone={() => undefined} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("calls onDone after about four seconds, not before", () => {
    const onDone = vi.fn();
    render(<Toast message="Note." onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("starts the clock again for a new note", () => {
    const onDone = vi.fn();
    const view = render(<Toast message="One." onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 100);
    });
    view.rerender(<Toast message="Two." onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 100);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("starts the clock again when the same text comes twice in a row", () => {
    const onDone = vi.fn();
    const view = render(<Toast message="Same." nonce={1} onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 100);
    });
    view.rerender(<Toast message="Same." nonce={2} onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 100);
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});
