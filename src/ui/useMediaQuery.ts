// src/ui/useMediaQuery.ts
import { useEffect, useState } from "preact/hooks";

/** The phone layout: the list becomes a sheet at the foot of the screen (style.css has the same line). */
export const PHONE_QUERY = "(width < 760px)";

const read = (query: string): boolean =>
  typeof matchMedia === "function" && matchMedia(query).matches;

/** Whether a media query holds now, and re-renders when that changes. False where there is no `matchMedia`. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => read(query));
  useEffect(() => {
    if (typeof matchMedia !== "function") {
      return undefined;
    }
    const list = matchMedia(query);
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}
