// src/ui/AppHeader.tsx
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { SaveState } from "../app/state";
import { SavedStatus } from "./SavedStatus";
import { menuNoticeCount } from "./noticePlacement";

export interface AppHeaderProps {
  name: string;
  onRename: (name: string) => void;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDownload: () => void;
  downloadDisabled: boolean;
  /** Something inside the project menu needs a look: the button wears a dot. */
  menuDot: boolean;
  /** How many notices wait in the menu: the button's name says it (1 when only `menuDot` is set). */
  menuNoticeCount?: number;
  /** The menu's content; `close` shuts the menu (after a choice). */
  menu: (close: () => void) => ComponentChildren;
}

/** Four squares, one in each kind's colour: the insert's pieces. */
function LogoMark() {
  return (
    <svg class="app-logo" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" rx="1" fill="var(--cards-line)" />
      <rect x="13" y="2" width="9" height="9" rx="1" fill="var(--bits-line)" />
      <rect x="2" y="13" width="9" height="9" rx="1" fill="var(--tiles-line)" />
      <rect x="13" y="13" width="9" height="9" rx="1" fill="var(--minis-line)" />
    </svg>
  );
}

const ICON = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
} as const;

/** The project name: edited in place, committed as it is typed. */
function NameInput({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [text, setText] = useState(name);
  // What the name was when the field got focus: Escape goes back to it.
  const atFocus = useRef(name);
  useEffect(() => {
    setText(name);
  }, [name]);
  return (
    <input
      class="app-name"
      type="text"
      aria-label="Project name"
      placeholder="(unnamed)"
      value={text}
      onFocus={() => {
        atFocus.current = name;
      }}
      onInput={(e) => {
        setText(e.currentTarget.value);
        onRename(e.currentTarget.value);
      }}
      onBlur={() => {
        const trimmed = text.trim();
        if (trimmed !== text) {
          setText(trimmed);
          onRename(trimmed);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape" && text !== atFocus.current) {
          setText(atFocus.current);
          onRename(atFocus.current);
        }
      }}
    />
  );
}

/** The bar on top: logo, name, where it is saved, Undo and Redo, the project menu and Download. */
export function AppHeader(p: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** Shuts the menu and puts the focus back on its button. */
  const close = (): void => {
    setOpen(false);
    button.current?.focus();
  };
  // Opening moves the focus to the first item.
  useEffect(() => {
    if (open) {
      panel.current?.querySelector<HTMLElement>("button, input, [href]")?.focus();
    }
  }, [open]);
  // The menu closes on a click outside it and on Escape (the focus goes back to its button).
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <header class="pf-app__bar app-header">
      <h1 class="app-brand">
        <LogoMark />
        <span class="app-wordmark">Insert Generator</span>
      </h1>
      <div class="app-name-block">
        <NameInput name={p.name} onRename={p.onRename} />
        <SavedStatus state={p.saveState} />
      </div>
      <div class="app-actions">
        <button
          type="button"
          class="app-icon-btn"
          aria-disabled={!p.canUndo}
          onClick={() => {
            if (p.canUndo) {
              p.onUndo();
            }
          }}
          aria-label="Undo"
        >
          <svg {...ICON}>
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
          <span class="app-btn-label" aria-hidden="true">
            Undo
          </span>
        </button>
        <button
          type="button"
          class="app-icon-btn"
          aria-disabled={!p.canRedo}
          onClick={() => {
            if (p.canRedo) {
              p.onRedo();
            }
          }}
          aria-label="Redo"
        >
          <svg {...ICON}>
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H10a6 6 0 0 0 0 12h3" />
          </svg>
          <span class="app-btn-label" aria-hidden="true">
            Redo
          </span>
        </button>
        <div
          class="app-menu-wrap"
          ref={wrap}
          onBlurCapture={(e) => {
            // The focus went somewhere outside the menu (Tab past its end, say): it closes and
            // leaves the focus where it went. A focus that went nowhere is the click handler's.
            const to = e.relatedTarget;
            if (open && to instanceof Node && !wrap.current?.contains(to)) {
              setOpen(false);
            }
          }}
        >
          <button
            type="button"
            class="app-icon-btn app-menu-btn"
            ref={button}
            aria-expanded={open}
            aria-controls="project-menu"
            onClick={() => setOpen(!open)}
          >
            <svg {...ICON} fill="currentColor" stroke="none">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
            <span class="visually-hidden">
              {`Project menu${menuNoticeCount(p.menuNoticeCount ?? (p.menuDot ? 1 : 0))}`}
            </span>
            {p.menuDot ? <span class="app-menu-dot" aria-hidden="true" /> : null}
          </button>
          {open ? (
            <div
              class="app-menu-panel"
              id="project-menu"
              role="group"
              aria-label="Project"
              ref={panel}
            >
              {p.menu(close)}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          class="app-download"
          disabled={p.downloadDisabled}
          aria-haspopup="dialog"
          onClick={p.onDownload}
        >
          Download
        </button>
      </div>
    </header>
  );
}
