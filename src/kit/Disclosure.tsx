// src/kit/Disclosure.tsx
import type { ComponentChildren } from "preact";
import { useId, useState } from "preact/hooks";
import { Icon } from "./icons";

export interface DisclosureProps {
  title: string;
  /** 13 px muted, under the title: what is inside, in a few words. */
  summary?: string;
  /** Controlled: whether it is open. Leave it out and the disclosure keeps its own state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ComponentChildren;
}

/** A row that opens a panel under it (Edit's "More options"). The panel exists only while open. */
export function Disclosure({
  title,
  summary,
  open: controlled,
  defaultOpen = false,
  onOpenChange,
  children,
}: DisclosureProps) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const panelId = useId();
  return (
    <div class="k-disclosure">
      <button
        type="button"
        class="k-disclosure__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOwn(!open);
          onOpenChange?.(!open);
        }}
      >
        <span class="k-disclosure__text">
          <span class="k-disclosure__title">{title}</span>
          {summary !== undefined ? <span class="k-disclosure__summary">{summary}</span> : null}
        </span>
        <span class="k-disclosure__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      {open ? (
        <div class="k-disclosure__panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
