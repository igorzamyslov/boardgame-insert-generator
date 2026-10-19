// src/screens/Workspace.tsx
import type { ComponentChildren, RefObject } from "preact";
import { useState } from "preact/hooks";
import { Sheet } from "../kit";
import { RailHandle } from "./RailHandle";

/**
 * The phone's rail: the sheet that holds the rail's content (below 760 px). The owner keeps its
 * state, so it can open the sheet for an editor and take the focus to its handle.
 */
export interface WorkspaceSheet {
  /** The sheet's name for assistive technology. */
  label: string;
  /** The handle's words. */
  title: string;
  /** The line after the title that says what is inside (the count); it stays while the sheet is folded. */
  summary?: string;
  /** The grip's own button, named so ("Show everything"). */
  handleLabel?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  full?: boolean;
  editing?: boolean;
  handleRef?: RefObject<HTMLButtonElement | null>;
  action?: ComponentChildren;
  /** Its `data-region` ("sheet"): another sheet in front of it (a tray's, Task 8) takes the name, so only one has it. */
  region?: string;
}

export interface WorkspaceProps {
  /** The header's content (the banner landmark is the shell's). */
  header: ComponentChildren;
  /** What the rail holds: on a phone, the sheet's content. */
  rail: ComponentChildren;
  /** What the stage holds (the one `main`). */
  stage: ComponentChildren;
  /** The wider stage padding of a screen that is one task: first visit, an editor, the box, a fit problem. */
  focus?: boolean;
  /** On a phone the rail is this sheet; without it the rail is the `aside` at every width. */
  sheet?: WorkspaceSheet;
  /** A class on the shell, for a screen that restyles its regions (the first visit's `fv`). */
  class?: string;
  /**
   * The rail's width in px and how it is remembered (`prefs.railWidth`): the person drags the
   * rail's handle (below the sheet's width there is none). Without it the rail is 300 px.
   */
  railWidth?: { value: number; onChange: (px: number) => void };
  /** Set on what is behind a sheet that fills the screen, so Tab and screen readers skip it. */
  inert?: boolean;
}

/**
 * The shell of every screen after the first: the header on top, then the rail and the stage as
 * Main draws them (UI rebuild Task 3). It lays out and names the regions (`data-region`: header,
 * rail, stage) and nothing else; the screens fill the slots. The CSS is `workspace.css`.
 */
export function Workspace(p: WorkspaceProps) {
  // `inert` is not in Preact's typings yet.
  const behindSheet = { inert: p.inert === true ? true : undefined } as Record<string, unknown>;
  const sheet = p.sheet;
  /** The width a drag shows before it is remembered; null when no drag is going on. */
  const [drag, setDrag] = useState<number | null>(null);
  const railWidth = p.railWidth;
  const width = drag ?? railWidth?.value;
  return (
    <div
      class={`ws${sheet ? " ws--sheet" : ""}${drag !== null ? " ws--resizing" : ""}${p.class ? ` ${p.class}` : ""}`}
      style={width === undefined ? undefined : { "--rail-w": `${width}px` }}
    >
      <header class="ws-header" data-region="header" {...behindSheet}>
        {p.header}
      </header>
      <div class="ws-body">
        {sheet ? (
          <Sheet
            region={sheet.region ?? "sheet"}
            peek
            label={sheet.label}
            title={sheet.title}
            meta={sheet.summary}
            expanded={sheet.expanded}
            onExpandedChange={sheet.onExpandedChange}
            full={sheet.full}
            editing={sheet.editing}
            handleLabel={sheet.handleLabel}
            handleRef={sheet.handleRef}
            action={sheet.action}
          >
            {p.rail}
          </Sheet>
        ) : (
          <aside class="ws-rail" data-region="rail" aria-label="What's inside">
            {p.rail}
          </aside>
        )}
        {!sheet && railWidth && width !== undefined ? (
          <RailHandle
            width={width}
            onPreview={setDrag}
            onCommit={(px) => {
              railWidth.onChange(px);
              setDrag(null);
            }}
          />
        ) : null}
        <main
          class={`ws-stage${p.focus ? " ws-stage--focus" : ""}`}
          data-region="stage"
          {...behindSheet}
        >
          {p.stage}
        </main>
      </div>
    </div>
  );
}
