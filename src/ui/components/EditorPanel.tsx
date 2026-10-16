// src/ui/components/EditorPanel.tsx
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { Component } from "../../model/types";
import { TextField } from "../fields";
import { shadeVars } from "../identity";
import { KindIcon } from "../KindIcon";
import { Toast } from "../Toast";
import { BulkEditor } from "./BulkEditor";
import { CardsEditor } from "./CardsEditor";
import { CustomEditor } from "./CustomEditor";
import { MinisEditor } from "./MinisEditor";
import { describeOptionChange } from "./optionNotes";
import { TilesEditor } from "./TilesEditor";

export interface EditorPanelProps {
  component: Component;
  /** Where the component is in the list: its validation paths. */
  index: number;
  /** Which shade of its kind's hue it takes: how many of its kind come before it. */
  kindIndex: number;
  /** Another component has the same name: the Remove button says which one by its position. */
  sameName?: boolean;
  onChange: (next: Component) => void;
  /** The back link and Done: leave the editor for the list. */
  onBack: () => void;
  /** The removal was confirmed. */
  onRemove: () => void;
}

function KindEditor({
  component: c,
  index,
  onChange,
}: Pick<EditorPanelProps, "component" | "index" | "onChange">) {
  switch (c.kind) {
    case "cards":
      return <CardsEditor component={c} index={index} onChange={onChange} />;
    case "bulk":
      return <BulkEditor component={c} index={index} onChange={onChange} />;
    case "tiles":
      return <TilesEditor component={c} index={index} onChange={onChange} />;
    case "minis":
      return <MinisEditor component={c} index={index} onChange={onChange} />;
    case "custom":
      return <CustomEditor component={c} index={index} onChange={onChange} />;
  }
}

/**
 * One component's editor, in the place of the list: the basics of its kind, then More options
 * (already folded inside each editor) in the same panel. A change to an option says what it does
 * in a short note. Removing asks first, in place; the undo toast of the app follows.
 */
export function EditorPanel({
  component: c,
  index,
  kindIndex,
  sameName = false,
  onChange,
  onBack,
  onRemove,
}: EditorPanelProps) {
  const headingId = `${c.id}-heading`;
  const name = c.name === "" ? "(unnamed)" : c.name;
  const who = sameName ? `${name} (item ${index + 1})` : name;
  const [note, setNote] = useState<{ text: string; id: number } | null>(null);
  const noteId = useRef(0);
  const [asking, setAsking] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const clearNote = useCallback(() => setNote(null), []);

  // The panel replaced the list: the reader starts at its top, and a screen reader hears whose it is.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const change = (next: Component): void => {
    const said = describeOptionChange(c, next);
    if (said !== null) {
      noteId.current += 1;
      setNote({ text: said, id: noteId.current });
    }
    onChange(next);
  };
  const ask = (yes: boolean): void => {
    setAsking(yes);
    // The button that had the focus goes: its counterpart takes it.
    setTimeout(() => (yes ? keepRef : removeRef).current?.focus(), 0);
  };

  return (
    <section class="editor-panel" style={shadeVars(c.kind, kindIndex)} aria-labelledby={headingId}>
      <div class="editor-panel__bar">
        <button type="button" class="pf-back" onClick={onBack}>
          <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M7.5 2l-4 4 4 4" />
          </svg>
          What&apos;s inside
        </button>
        <button type="button" class="primary editor-panel__btn" onClick={onBack}>
          Done
        </button>
      </div>
      <h3 class="editor-panel__title" id={headingId} tabIndex={-1} ref={headingRef}>
        <KindIcon kind={c.kind} />
        <span>{name}</span>
      </h3>
      <div class="form-grid">
        <TextField
          id={`${c.id}-name`}
          label="Name"
          value={c.name}
          onCommit={(next) => onChange({ ...c, name: next })}
        />
        <KindEditor component={c} index={index} onChange={change} />
      </div>
      <div class="component-card-foot">
        {asking ? (
          <div class="editor-panel__ask" role="group" aria-label={`Remove ${who}?`}>
            <span>{`Remove “${name}” from the box?`}</span>
            <button
              type="button"
              class="row-remove editor-panel__btn"
              aria-label={`Remove ${who}`}
              onClick={onRemove}
            >
              Remove
            </button>
            <button
              type="button"
              class="editor-panel__btn"
              ref={keepRef}
              onClick={() => ask(false)}
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            class="row-remove editor-panel__btn"
            ref={removeRef}
            aria-label={`Remove ${who}…`}
            onClick={() => ask(true)}
          >
            Remove…
          </button>
        )}
      </div>
      <Toast message={note?.text ?? null} nonce={note?.id} onDone={clearNote} />
    </section>
  );
}
