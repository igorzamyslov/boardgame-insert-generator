// src/kit/blocked.tsx
import type { ButtonHTMLAttributes, JSX, MouseEventHandler } from "preact";
import { useId } from "preact/hooks";

type Click = MouseEventHandler<HTMLButtonElement>;

/**
 * A blocked action stays focusable and says why (DESIGN §2): `aria-disabled="true"`, never
 * `disabled`, `aria-describedby` pointing at a visually hidden sentence, and a click that does
 * nothing. `props` goes on the button; `reason` renders beside it.
 */
export function useBlocked(
  reason: string | undefined,
  onClick: Click | undefined,
): { props: ButtonHTMLAttributes<HTMLButtonElement>; reason: JSX.Element | null } {
  const id = useId();
  if (reason === undefined) {
    return { props: { onClick }, reason: null };
  }
  return {
    props: {
      "aria-disabled": "true",
      "aria-describedby": id,
      onClick: (e) => e.preventDefault(),
    },
    reason: (
      <span id={id} class="visually-hidden">
        {reason}
      </span>
    ),
  };
}
