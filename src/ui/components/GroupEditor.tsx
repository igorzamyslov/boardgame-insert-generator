// src/ui/components/GroupEditor.tsx
// A group's editor (G2, spec §7.4), in the place of the list as an item's is (MobileEdit's sheet on
// a phone): its name, Copies, how often it is reached for, the order of its items in the tray, and
// Remove group…. The group's Extra room (G2's last row) is not built (owner's ruling O2).
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { Button, GripIcon, GroupGlyph, Icon, IconButton, IconTile, Stepper } from "../../kit";
import { DEFAULT_GROUP_NAME } from "../../model/groups";
import type { Access, ComponentKind, Group } from "../../model/types";
import { COPIES } from "../limits";
import { ACCESS_OPTIONS } from "./CommonOptions";
import { messagesOf } from "../FieldMessages";
import { useFieldNotices } from "../validation";
import { Alert, Choice, Group as Field, TextBox, TitleInput } from "./controls";

/** One of the group's items, as the order list shows it. */
export interface GroupEditorMember {
  id: string;
  kind: ComponentKind;
  /** What it is called ("(unnamed)" when it has no name). */
  name: string;
  /** The name that tells two items of one name apart ("Cards (item 3)"): the buttons' label. */
  who: string;
  /** Its own shade of its kind, as custom properties (`shadeVars`). */
  shade: Record<string, string>;
}

export interface GroupEditorProps {
  group: Group;
  /** The group's place in the project's groups: its validation path (`/groups/<index>/copies`). */
  index: number;
  /** The group's items, in the group's own order. */
  members: readonly GroupEditorMember[];
  onRename: (name: string) => void;
  onCopies: (copies: number) => void;
  onAccess: (access: Access) => void;
  /** An item moved to a place in the order (the place is its new index). */
  onMove: (itemId: string, index: number) => void;
  /** An item's name was chosen: its editor opens (its back link returns here). */
  onOpenItem: (itemId: string) => void;
  /** The back link and Done: leave the editor for the list. */
  onBack: () => void;
  /** The removal was confirmed. */
  onRemove: () => void;
  /** What a move did, by names: the rail says it aloud (a polite live region). */
  onAnnounce?: (text: string) => void;
  /** The focus goes to this item's name instead of the heading (coming back from its editor). */
  focusItemId?: string;
  /** Below 760 px: MobileEdit's full-screen sheet, with its own header and no foot. */
  phone?: boolean;
  /** The phone's strip under the header: the tray drawn small and the stage sentence (or the note). */
  strip?: ComponentChildren;
}

/** "Remove the group “Player kit”? Its 3 items stay, with 4 copies each." (spec §7.4, §8) */
export function removeQuestion(name: string, items: number, copies: number): string {
  const head = `Remove the group “${name}”?`;
  if (items === 0) {
    return head;
  }
  const stay = items === 1 ? "Its 1 item stays" : `Its ${items} items stay`;
  if (copies <= 1) {
    return `${head} ${stay}.`;
  }
  return `${head} ${stay}, with ${copies} ${items === 1 ? "copies" : "copies each"}.`;
}

/** What a move says aloud, by names and never by place: "Hero is now first.", "Hero is now after Starter deck." */
export function movedWords(who: string, before: string | undefined): string {
  return before === undefined ? `${who} is now first.` : `${who} is now after ${before}.`;
}

type Way = "up" | "down";

/** The order of the group's items: a row each, with the buttons that keep the keyboard's way (WCAG 2.5.7). */
function OrderList({
  members,
  focusItemId,
  phone,
  onMove,
  onOpenItem,
  onAnnounce,
}: Pick<
  GroupEditorProps,
  "members" | "focusItemId" | "phone" | "onMove" | "onOpenItem" | "onAnnounce"
>) {
  const labelId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  // The button pressed keeps the focus as its row moves (a moved node drops it): found again by
  // the item and the way once the list has drawn the new order.
  const pressed = useRef<{ id: string; way: Way } | null>(null);
  const order = members.map((m) => m.id).join(",");
  useEffect(() => {
    const p = pressed.current;
    if (p === null) {
      return;
    }
    pressed.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-move="${p.way}"][data-item="${p.id}"]`)
      ?.focus();
  }, [order]);
  useEffect(() => {
    if (focusItemId !== undefined) {
      listRef.current?.querySelector<HTMLElement>(`[data-open-item="${focusItemId}"]`)?.focus();
    }
    // only when the editor comes back from an item
  }, []);

  const move = (i: number, way: Way): void => {
    const m = members[i];
    if (m === undefined) {
      return;
    }
    const to = way === "up" ? i - 1 : i + 1;
    // nothing to move at an end: no place to go, nothing to say
    if (to < 0 || to >= members.length) {
      return;
    }
    pressed.current = { id: m.id, way };
    onMove(m.id, to);
    // after the move, who stands before it: the item it passed (down), or the one before that (up)
    const before = way === "up" ? members[i - 2] : members[i + 1];
    onAnnounce?.(movedWords(m.who, before?.who));
  };
  return (
    <div class="ed-group">
      <span class="ed-label" id={labelId}>
        Order in the tray
      </span>
      <ol class="ed-order" aria-labelledby={labelId} ref={listRef}>
        {members.map((m, i) => {
          const first = i === 0;
          const last = i === members.length - 1;
          const firstWords = `${m.who} is already first.`;
          const lastWords = `${m.who} is already last.`;
          return (
            <li class="ed-order__row" key={m.id} style={m.shade}>
              {/* a phone has no dragging (spec §7.8): Up and Down are its way */}
              {phone === true ? null : (
                <span class="gc-grip" aria-hidden="true">
                  <GripIcon />
                </span>
              )}
              <span class="k-row__swatch" aria-hidden="true" />
              <button
                type="button"
                class="ed-order__name"
                data-open-item={m.id}
                title={m.name}
                onClick={() => onOpenItem(m.id)}
              >
                {m.name}
              </button>
              <IconButton
                label={`Move ${m.who} up`}
                variant="plain"
                icon={<Icon name="chevron-up" size={16} />}
                data-move="up"
                data-item={m.id}
                title={first ? firstWords : undefined}
                blockedReason={first ? firstWords : undefined}
                onBlockedClick={() => onAnnounce?.(firstWords)}
                onClick={() => move(i, "up")}
              />
              <IconButton
                label={`Move ${m.who} down`}
                variant="plain"
                icon={<Icon name="chevron-down" size={16} />}
                data-move="down"
                data-item={m.id}
                title={last ? lastWords : undefined}
                blockedReason={last ? lastWords : undefined}
                onBlockedClick={() => onAnnounce?.(lastWords)}
                onClick={() => move(i, "down")}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The group's editor: the page's h2 here only names the panel and takes the focus (the stage's
 * sentence is the h1). Removing asks in place, as an item's does; the app's undo toast follows.
 */
export function GroupEditor({
  group,
  index,
  members,
  onRename,
  onCopies,
  onAccess,
  onMove,
  onOpenItem,
  onBack,
  onRemove,
  onAnnounce,
  focusItemId,
  phone = false,
  strip,
}: GroupEditorProps) {
  const name = group.name === "" ? DEFAULT_GROUP_NAME : group.name;
  const copies = group.copies ?? 1;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const copiesAlertId = useId();
  const copiesRefused = messagesOf(useFieldNotices(`/groups/${index}/copies`)).errors.length > 0;
  const [asking, setAsking] = useState(false);

  // The panel replaced the list: the reader starts at its top, and a screen reader hears whose it is.
  // Coming back from an item, the focus is on that item's name (the order list takes it).
  useEffect(() => {
    if (focusItemId === undefined) {
      headingRef.current?.focus();
    }
  }, []);

  const ask = (yes: boolean): void => {
    setAsking(yes);
    // The button that had the focus goes: its counterpart takes it.
    setTimeout(() => (yes ? keepRef : removeRef).current?.focus(), 0);
  };
  const answer = (
    <div class="ed-ask" role="group" aria-label={`Remove the group ${name}?`}>
      <span>{removeQuestion(name, members.length, copies)}</span>
      <div class="ed-ask__buttons">
        <Button variant="secondary" class="ed-remove-yes" onClick={onRemove}>
          Remove group
        </Button>
        <Button variant="quiet" ref={keepRef} onClick={() => ask(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
  const remove = (
    <button type="button" class="ed-remove" ref={removeRef} onClick={() => ask(true)}>
      Remove group…
    </button>
  );
  const copiesField = (
    <Field label="Copies">
      <Stepper
        label="Copies"
        value={copies}
        min={COPIES.min}
        max={COPIES.max}
        onChange={onCopies}
        invalid={copiesRefused}
        describedBy={copiesRefused ? copiesAlertId : undefined}
      />
      <Alert id={copiesAlertId} path={`/groups/${index}/copies`} />
      <span class="ed-line">Each copy is its own tray.</span>
    </Field>
  );
  const access = (
    <Choice
      label="How often you reach for it"
      options={ACCESS_OPTIONS}
      value={group.access}
      onChange={onAccess}
    />
  );
  const order =
    members.length === 0 ? (
      <p class="gc-empty ed-empty">Drag items here, or use Move to group… in an item.</p>
    ) : (
      <OrderList
        members={members}
        focusItemId={focusItemId}
        phone={phone}
        onMove={onMove}
        onOpenItem={onOpenItem}
        onAnnounce={onAnnounce}
      />
    );

  if (phone) {
    return (
      <section class="ed ed--phone ed--group" data-group aria-label={`Edit ${name}`}>
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
          <TextBox id={`${group.id}-name`} label="Name" value={group.name} onCommit={onRename} />
          {copiesField}
          {access}
          {order}
          <div class="ed-remove-row">{asking ? answer : remove}</div>
        </div>
      </section>
    );
  }
  return (
    <section class="ed ed--group" data-group aria-labelledby={`${group.id}-heading`}>
      {/* the page's h1 is the stage's sentence: this names the panel and takes the focus */}
      <h2 class="visually-hidden" id={`${group.id}-heading`} tabIndex={-1} ref={headingRef}>
        {name}
      </h2>
      <button type="button" class="ed-back" onClick={onBack}>
        <Icon name="chevron-left" size={16} />
        What&apos;s inside
      </button>
      <div class="ed-id">
        <IconTile size={44} tone="group">
          <GroupGlyph size={22} />
        </IconTile>
        <label class="ed-id__label">
          <span class="ed-id__kind">Group</span>
          <TitleInput id={`${group.id}-name`} label="Name" value={group.name} onCommit={onRename} />
        </label>
      </div>
      {copiesField}
      {access}
      {order}
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
