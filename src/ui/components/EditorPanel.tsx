// src/ui/components/EditorPanel.tsx
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Button, Icon, IconButton, IconTile } from "../../kit";
import type { Component } from "../../model/types";
import { KIND_TILES } from "../../screens/KindPicker";
import { shadeVars } from "../identity";
import { BulkEditor } from "./BulkEditor";
import { CardsEditor } from "./CardsEditor";
import { TextBox, TitleInput } from "./controls";
import { CustomEditor } from "./CustomEditor";
import { MinisEditor } from "./MinisEditor";
import { groupNameOf, ItemGroupingContext } from "./GroupRow";
import type { ItemGrouping } from "./GroupRow";
import { describeOptionChange } from "./optionNotes";
import { TilesEditor } from "./TilesEditor";
import "./editor.css";

export interface EditorPanelProps {
  component: Component;
  /** Where the component is in the list: its validation paths. */
  index: number;
  /** Which shade of its kind's hue it takes: how many of its kind come before it. */
  kindIndex: number;
  /** Another component has the same name: the Remove button says which one by its position. */
  sameName?: boolean;
  onChange: (next: Component) => void;
  /** The back link and Done: leave the editor for the list (or the group's editor it was opened from). */
  onBack: () => void;
  /** What the back link says: the group's name when the item was opened from its editor. */
  backLabel?: string;
  /** The removal was confirmed. */
  onRemove: () => void;
  /**
   * The groups, for an item's Group row and its Copies; the app gives it. Without it the editor is
   * drawn alone: the item is in no group and has no Group row. An item in a group has "In <group>"
   * under its name and no Copies or access of its own (spec §7.5).
   */
  grouping?: ItemGrouping;
  /** A change to an option has this to say: the stage shows it as a note (Edit's toast). */
  onNote?: (text: string) => void;
  /** Below 760 px: MobileEdit's full-screen sheet, with its own header and no foot. */
  phone?: boolean;
  /** The phone's strip under the header: the tray drawn small and the stage sentence (or the note). */
  strip?: ComponentChildren;
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
 * One component's editor, in the place of the list (Edit; MobileEdit on a phone): the basics of
 * its kind, then More options opening in the same panel. A change to an option says what it does in
 * a short note, which the stage shows. Removing asks first, in place; the undo toast of the app
 * follows.
 */
export function EditorPanel({
  component: c,
  index,
  kindIndex,
  sameName = false,
  onChange,
  onBack,
  backLabel,
  onRemove,
  onNote,
  grouping,
  phone = false,
  strip,
}: EditorPanelProps) {
  const name = c.name === "" ? "(unnamed)" : c.name;
  const who = sameName ? `${name} (item ${index + 1})` : name;
  const [asking, setAsking] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  // The panel replaced the list: the reader starts at its top, and a screen reader hears whose it is.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const change = (next: Component): void => {
    const said = describeOptionChange(c, next);
    if (said !== null) {
      onNote?.(said);
    }
    onChange(next);
  };
  const ask = (yes: boolean): void => {
    setAsking(yes);
    // The button that had the focus goes: its counterpart takes it.
    setTimeout(() => (yes ? keepRef : removeRef).current?.focus(), 0);
  };
  const removeLabel = phone ? `Remove ${name}…` : "Remove…";
  const answer = (
    <div class="ed-ask" role="group" aria-label={`Remove ${who}?`}>
      <span>{`Remove “${name}” from the box?`}</span>
      <div class="ed-ask__buttons">
        <Button
          variant="secondary"
          class="ed-remove-yes"
          aria-label={`Remove ${who}`}
          onClick={onRemove}
        >
          Remove
        </Button>
        <Button variant="quiet" ref={keepRef} onClick={() => ask(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
  const remove = (
    <button
      type="button"
      class="ed-remove"
      ref={removeRef}
      aria-label={`Remove ${who}…`}
      onClick={() => ask(true)}
    >
      {removeLabel}
    </button>
  );
  // Escape leaves the editor, as Done does; one that something inside took (a menu, a drag) is theirs.
  const leaveOnEscape = (e: KeyboardEvent): void => {
    if (
      e.key !== "Escape" ||
      e.defaultPrevented ||
      (e.target as HTMLElement).tagName === "SELECT"
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    onBack();
  };
  const kind = KIND_TILES.find((t) => t.kind === c.kind)?.label ?? "";
  const rename = (next: string): void => onChange({ ...c, name: next });
  const group = grouping?.group;
  // "In Player kit", under the name: it opens the group's editor
  const inGroup =
    group === undefined ? null : (
      <button type="button" class="ed-ingroup" onClick={() => grouping?.onEditGroup(group.id)}>
        {`In ${groupNameOf(group.name)}`}
      </button>
    );
  const kindEditor = (
    <ItemGroupingContext.Provider value={grouping}>
      <KindEditor component={c} index={index} onChange={change} />
    </ItemGroupingContext.Provider>
  );

  if (phone) {
    return (
      <section
        class="ed ed--phone"
        data-kind={c.kind}
        style={shadeVars(c.kind, kindIndex)}
        aria-label={`Edit ${name}`}
        onKeyDown={leaveOnEscape}
      >
        <header class="ed-bar">
          <IconButton
            label="Back"
            variant="plain"
            icon={<Icon name="chevron-left" size={20} />}
            onClick={onBack}
          />
          <h1 class="ed-bar__title" tabIndex={-1} ref={headingRef}>
            {name}
          </h1>
          <Button variant="primary" class="ed-done" onClick={onBack}>
            Done
          </Button>
        </header>
        {strip}
        <div class="ed-scroll">
          <TextBox id={`${c.id}-name`} label="Name" value={c.name} onCommit={rename} />
          {inGroup}
          {kindEditor}
          <div class="ed-remove-row">{asking ? answer : remove}</div>
        </div>
      </section>
    );
  }
  return (
    <section
      class="ed"
      data-kind={c.kind}
      style={shadeVars(c.kind, kindIndex)}
      aria-labelledby={`${c.id}-heading`}
      onKeyDown={leaveOnEscape}
    >
      {/* the page's h1 is the stage's sentence: this names the panel and takes the focus */}
      <h2 class="visually-hidden" id={`${c.id}-heading`} tabIndex={-1} ref={headingRef}>
        {name}
      </h2>
      <div class="ed-head">
        <button type="button" class="ed-back" onClick={onBack}>
          <Icon name="chevron-left" size={16} />
          {backLabel ?? "What's inside"}
        </button>
        <div class="ed-id">
          <IconTile size={44} kind={c.kind} />
          <div class="ed-id__text">
            <label class="ed-id__label">
              <span class="ed-id__kind">{kind}</span>
              <TitleInput id={`${c.id}-name`} label="Name" value={c.name} onCommit={rename} />
            </label>
            {inGroup}
          </div>
        </div>
      </div>
      {kindEditor}
      <div class="ed-foot">
        {asking ? (
          answer
        ) : (
          <>
            {remove}
            <Button variant="primary" class="ed-done" onClick={onBack}>
              Done
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
