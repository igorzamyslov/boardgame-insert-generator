// src/screens/useSettled.test.tsx
// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettled } from "./useSettled";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Renders the hook's answer into `seen`, one entry per render. */
function Probe({
  values,
  ms,
  seen,
}: {
  values: readonly unknown[];
  ms: number;
  seen: unknown[][];
}) {
  seen.push([...useSettled(values, ms)]);
  return null;
}

describe("useSettled", () => {
  it("gives the first values at once", () => {
    const seen: unknown[][] = [];
    render(<Probe values={["a", 1]} ms={300} seen={seen} />);
    expect(seen.at(-1)).toEqual(["a", 1]);
  });

  it("holds the old values while they keep changing, and gives the last ones once they stop", () => {
    const seen: unknown[][] = [];
    const { rerender } = render(<Probe values={["a"]} ms={300} seen={seen} />);
    for (const v of ["ab", "abc", "abcd"]) {
      rerender(<Probe values={[v]} ms={300} seen={seen} />);
      act(() => {
        vi.advanceTimersByTime(200); // less than the wait: the next change comes first
      });
      expect(seen.at(-1)).toEqual(["a"]);
    }
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(seen.at(-1)).toEqual(["abcd"]);
    // one change of the held values for the whole burst, not one per change
    expect(new Set(seen.map((s) => s[0]))).toEqual(new Set(["a", "abcd"]));
  });

  it("is not restarted by a render that changes nothing", () => {
    const seen: unknown[][] = [];
    const values = ["x"];
    const { rerender } = render(<Probe values={values} ms={300} seen={seen} />);
    rerender(<Probe values={["y"]} ms={300} seen={seen} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<Probe values={["y"]} ms={300} seen={seen} />); // a new array, the same value
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(seen.at(-1)).toEqual(["y"]);
  });

  it("leaves no timer behind when it goes", () => {
    const seen: unknown[][] = [];
    const { rerender, unmount } = render(<Probe values={["x"]} ms={300} seen={seen} />);
    const before = vi.getTimerCount();
    rerender(<Probe values={["y"]} ms={300} seen={seen} />);
    expect(vi.getTimerCount()).toBeGreaterThan(before);
    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen.at(-1)).toEqual(["x"]);
  });
});
