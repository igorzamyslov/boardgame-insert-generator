// src/ui/components/GroupRow.tsx
// An item's editor in a group's terms (0.7.0 Task 12, spec §7.3 and §7.5): what group the item is in
// and what the project's groups are, handed down by the editor panel; the Group row under More
// options (Move to group…, New group, Edit <group>, Take out of group).
import { createContext } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { Button, MenuItem, MenuPanel } from "../../kit";
import { DEFAULT_GROUP_NAME } from "../../model/groups";
import { ExactRow } from "./controls";

/** A group as the item's editor names it: by name, with the Copies its items have. */
export interface GroupChoice {
  id: string;
  /** What the group is called ("Group" when it has no name). */
  name: string;
  copies: number;
}

/** The group a name stands for: an unnamed group is "Group". */
export const groupNameOf = (name: string): string => name.trim() || DEFAULT_GROUP_NAME;

/** What the item's editor knows about groups, and what it can ask the app to do (each is one undo step). */
export interface ItemGrouping {
  /** The group the item is in. */
  group: GroupChoice | undefined;
  /** Every group of the project, in the list's order. */
  groups: readonly GroupChoice[];
  /** The item goes to the end of this group. */
  onMoveTo: (groupId: string) => void;
  /** A new group with this item as its only member. */
  onNewGroup: () => void;
  /** The item leaves its group, taking the group's Copies. */
  onTakeOut: () => void;
  /** The group's editor, in this one's place. */
  onEditGroup: (groupId: string) => void;
  /** The item's own Copies (an item in no group). */
  onCopies: (copies: number) => void;
}

/**
 * Provided by the editor panel inside the app. Editors drawn alone (the tests') have none: the item
 * is in no group, its Copies go through `onChange`, and there is no Group row to draw.
 */
export const ItemGroupingContext = createContext<ItemGrouping | undefined>(undefined);

/** The group the item is in, or undefined (no group, or an editor drawn alone). */
export function useItemGroup(): GroupChoice | undefined {
  return useContext(ItemGroupingContext)?.group;
}

/** "Copies and how often you reach for it are set on Player kit." (spec §7.5) */
export const setOnGroupLine = (name: string): string =>
  `Copies and how often you reach for it are set on ${groupNameOf(name)}.`;

/**
 * The Group row of More options, in the place the old "Group" box had. Closed it says the group's
 * name, or "None". Opened: an item in no group has "Move to group…" (a small panel, as Add's: each
 * group by name with "×N", then "New group"); an item in one has "In <group>", "Edit <group>" and
 * "Take out of group". The row stays where it is whichever way the item goes (DESIGN, Flow).
 */
export function GroupRow() {
  const g = useContext(ItemGroupingContext);
  const [choosing, setChoosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const moveButton = useRef<HTMLButtonElement>(null);
  const moveBox = useRef<HTMLDivElement>(null);
  // A press in this row took its own button away (it changed what the row holds): the focus goes
  // to the first button of what replaced it. A change from elsewhere (Undo) takes no focus.
  const pressed = useRef(false);
  const groupId = g?.group?.id;
  useEffect(() => {
    if (!pressed.current) {
      return;
    }
    pressed.current = false;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
  }, [groupId]);
  // The panel opens at the foot of a scrolling editor: it is brought into sight, above the sticky foot.
  useEffect(() => {
    if (choosing) {
      moveBox.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [choosing]);
  if (g === undefined) {
    return null;
  }
  const { group } = g;
  const act = (run: () => void) => (): void => {
    pressed.current = true;
    setChoosing(false);
    run();
  };
  return (
    <ExactRow title="Group" meta={group === undefined ? "None" : groupNameOf(group.name)}>
      <div class="ed-stack" ref={panel}>
        {group === undefined ? (
          <div
            class="ed-move"
            ref={moveBox}
            onKeyDown={(e) => {
              // the sheet folds on an Escape nobody took: this one is the panel's
              if (choosing && e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setChoosing(false);
                moveButton.current?.focus();
              }
            }}
          >
            <Button
              variant="secondary"
              ref={moveButton}
              aria-expanded={choosing}
              onClick={() => setChoosing(!choosing)}
            >
              Move to group…
            </Button>
            {choosing ? (
              <MenuPanel label="Move to group…">
                {g.groups.map((o) => (
                  <MenuItem key={o.id} meta={`×${o.copies}`} onClick={act(() => g.onMoveTo(o.id))}>
                    {groupNameOf(o.name)}
                  </MenuItem>
                ))}
                <MenuItem onClick={act(g.onNewGroup)}>New group</MenuItem>
              </MenuPanel>
            ) : null}
          </div>
        ) : (
          <>
            <span class="ed-line ed-line--ink">{`In ${groupNameOf(group.name)}`}</span>
            <div class="ed-ask__buttons">
              <Button
                variant="secondary"
                class="ed-fit"
                title={`Edit ${groupNameOf(group.name)}`}
                onClick={() => g.onEditGroup(group.id)}
              >
                <span class="ed-fit__label">{`Edit ${groupNameOf(group.name)}`}</span>
              </Button>
              <Button variant="quiet" onClick={act(g.onTakeOut)}>
                Take out of group
              </Button>
            </div>
          </>
        )}
      </div>
    </ExactRow>
  );
}

/** The line that stands where Copies and access were, for an item in a group. */
export function SetOnGroup() {
  const group = useItemGroup();
  if (group === undefined) {
    return null;
  }
  return <p class="ed-line ed-set-on">{setOnGroupLine(group.name)}</p>;
}
