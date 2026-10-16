// src/kit/blocked.tsx
import type { ButtonHTMLAttributes, JSX, MouseEventHandler } from "preact";
import { useId } from "preact/hooks";

type Click = MouseEventHandler<HTMLButtonElement>;

/**
 * A blocked action stays focusable and says why (DESIGN §2): `aria-disabled="true"`, never
 * `disabled`, `aria-describedby` pointing at a visually hidden sentence, and a click that does
 * nothing (or only `onBlocked`: a press on a blocked control can still say where the way out is).
 * `props` goes on the button; `reason` renders beside it.
 */
export function useBlocked(
  reason: string | undefined,
  onClick: Click | undefined,
  onBlocked?: () => void,
): { props: ButtonHTMLAttributes<HTMLButtonElement>; reason: JSX.Element | null } {
  const id = useId();
  if (reason === undefined) {
    return { props: { onClick }, reason: null };
  }
  return {
    props: {
      "aria-disabled": "true",
      // A blocked control whose own words already say why ("Fix the fit to download") has no reason to add.
      "aria-describedby": reason === "" ? undefined : id,
      onClick: (e) => {
        e.preventDefault();
        onBlocked?.();
      },
    },
    reason:
      reason === "" ? null : (
        <span id={id} class="visually-hidden">
          {reason}
        </span>
      ),
  };
}
