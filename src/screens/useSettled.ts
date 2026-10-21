// src/screens/useSettled.ts
// What a view that is costly to redraw should be given while the person is still typing.
import { useEffect, useState } from "preact/hooks";

/**
 * How long a change must stand still before the editor's 3D scene is redrawn (ms). About the
 * layout runner's own wait (`DEBOUNCE_MS`): a burst of keystrokes is one redraw.
 */
export const SETTLE_MS = 400;

/**
 * `values` as they were when they last stood still for `ms`. The first values come at once; after
 * that the answer keeps the old values until a change has not been followed by another for `ms`.
 * The values are compared one by one by identity, so a new array of the same members changes nothing.
 */
export function useSettled<T extends readonly unknown[] | readonly []>(values: T, ms: number): T {
  const [settled, setSettled] = useState<T>(values);
  useEffect(() => {
    if (values.length === settled.length && values.every((v, i) => Object.is(v, settled[i]))) {
      return undefined;
    }
    const timer = setTimeout(() => setSettled(values), ms);
    return () => clearTimeout(timer);
    // the members decide, not the array that holds them
  }, [ms, settled, ...values]);
  return settled;
}
