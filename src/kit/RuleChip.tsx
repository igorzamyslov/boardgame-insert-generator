// src/kit/RuleChip.tsx
import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import { Icon } from "./icons";

export interface RuleChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  /** Says what the × does: "Unpin Market deck and the trays on it". The caller writes it. */
  "aria-label": string;
  /** What the rule is: "Pinned", "Pinned, turned", "Size locked". */
  children: ComponentChildren;
}

/** An ink pill that names a rule and has an × to clear it. 32 px drawn, a 44 px target. */
export function RuleChip({ children, type = "button", ...rest }: RuleChipProps) {
  return (
    <button {...rest} type={type} class="k-rulechip">
      {children}
      <Icon name="close" size={12} />
    </button>
  );
}
