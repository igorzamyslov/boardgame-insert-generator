// src/ui/AppHeader.tsx
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { SaveState } from "../app/state";
import { SavedStatus } from "./SavedStatus";

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
      onInput={(e) => {
        setText(e.currentTarget.value);
        onRename(e.currentTarget.value);
      }}
    />
  );
}

/** The bar on top: logo, name, where it is saved, Undo and Redo, the project menu and Download. */
export function AppHeader(p: AppHeaderProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
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
        setOpen(false);
        button.current?.focus();
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
          disabled={!p.canUndo}
          onClick={p.onUndo}
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
          disabled={!p.canRedo}
          onClick={p.onRedo}
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
        <div class="app-menu-wrap" ref={wrap}>
          <button
            type="button"
            class="app-icon-btn app-menu-btn"
            ref={button}
            aria-haspopup="true"
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
              {p.menuDot ? "Project menu (needs your attention)" : "Project menu"}
            </span>
            {p.menuDot ? <span class="app-menu-dot" aria-hidden="true" /> : null}
          </button>
          {open ? (
            <div class="app-menu-panel" id="project-menu" role="group" aria-label="Project">
              {p.menu(() => setOpen(false))}
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
