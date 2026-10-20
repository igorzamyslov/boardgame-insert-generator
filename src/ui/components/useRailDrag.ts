// src/ui/components/useRailDrag.ts
// Dragging an item into, out of and within the groups of the rail (0.7.0 Task 14, spec §7.3):
// pointer events, no library, on a grip only. The geometry and the decisions are pure functions
// (`hitTest`, `dragLineAt`, `dropChange`, `pastThreshold`, `nextScroll`); the hook reads the list's
// rectangles from the DOM, moves the lifted row and the drop line by hand (no render per move) and
// calls `onDrop` once, when a drop would change something.
import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Group } from "../../model/types";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a drop puts an item: a group at a place among its other members, or out of any group. */
export type DropTarget = { groupId: string; index: number } | { out: true };

export interface GroupGeometry {
  id: string;
  /** The card's frame, header included. */
  rect: Rect;
  /** Where the members begin (their list's top), or an empty group's dashed area. */
  bodyTop: number;
  /** The members' rows, in order (the dragged one included when it is a member). */
  rows: readonly { id: string; rect: Rect }[];
}

export interface RailGeometry {
  list: Rect;
  groups: readonly GroupGeometry[];
}

/** Whether a drop is wanted: the pointer is nowhere (outside the list) or here. */
const within = (r: Rect, x: number, y: number): boolean =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** The rows of a group but the dragged one: the places are counted among these. */
const others = (g: GroupGeometry, itemId: string) => g.rows.filter((r) => r.id !== itemId);

/**
 * What the pointer is over (spec §7.3): a group's card (the header, between or below its members,
 * or an empty group's area) is that group, at the place of the pointer among the group's other
 * members; anywhere else in the list is out of any group; outside the list there is no target, and
 * a drop cancels. The dragged member never counts: its row stays in its place.
 */
export function hitTest(
  geometry: RailGeometry,
  point: { x: number; y: number },
  itemId: string,
): DropTarget | null {
  if (!within(geometry.list, point.x, point.y)) {
    return null;
  }
  const card = geometry.groups.find((g) => within(g.rect, point.x, point.y));
  if (card === undefined) {
    return { out: true };
  }
  const above = others(card, itemId).filter((r) => (r.rect.top + r.rect.bottom) / 2 < point.y);
  return { groupId: card.id, index: above.length };
}

/**
 * The line that marks a place: the y it lies at (its middle) and how far it runs across the card,
 * in the geometry's own coordinates. Between two members it is in the gap; before the first and
 * after the last, at their edge; in an empty group, at the top of its dashed area. Out has none.
 */
export function dragLineAt(
  geometry: RailGeometry,
  target: DropTarget,
  itemId: string,
): { y: number; left: number; right: number } | null {
  if ("out" in target) {
    return null;
  }
  const card = geometry.groups.find((g) => g.id === target.groupId);
  if (card === undefined) {
    return null;
  }
  const rows = others(card, itemId);
  const prev = rows[target.index - 1];
  const next = rows[target.index];
  let y = card.bodyTop;
  if (prev !== undefined && next !== undefined) {
    y = (prev.rect.bottom + next.rect.top) / 2;
  } else if (next !== undefined) {
    y = next.rect.top - 1;
  } else if (prev !== undefined) {
    y = prev.rect.bottom + 1;
  }
  return { y, left: card.rect.left + 4, right: card.rect.right - 4 };
}

export type DropChange = "none" | "into" | "out" | "order";

/**
 * What a drop does to the project: an item goes into a group (another's, or from the list), a
 * member goes out to the list, a member takes another place in its group's order; and nothing when
 * the item is not in a group and is dropped on the list (there is no reordering of ungrouped rows)
 * or when a member is dropped on the place it has.
 */
export function dropChange(
  groups: readonly Group[],
  itemId: string,
  target: DropTarget,
): DropChange {
  const own = groups.find((g) => g.memberIds.includes(itemId));
  if ("out" in target) {
    return own === undefined ? "none" : "out";
  }
  const into = groups.find((g) => g.id === target.groupId);
  if (into === undefined) {
    return "none";
  }
  if (own?.id !== into.id) {
    return "into";
  }
  const place = into.memberIds.filter((m) => m !== itemId).length;
  const at = into.memberIds.indexOf(itemId);
  // `at` is the place among the others, as `index` is
  return Math.min(target.index, place) === at ? "none" : "order";
}

/** How far below its top edge the pointer holds the lifted row, in px. */
const HOLD = 6;

/** A press on a grip becomes a drag after this much movement, in px. */
export const DRAG_THRESHOLD = 4;

/** Whether the pointer has moved far enough from where it went down to begin a drag. */
export function pastThreshold(
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD;
}

/** How near the list's top or bottom edge the pointer scrolls it, in px, and the fastest step. */
const EDGE = 40;
const MAX_STEP = 18;

/** The scroll step for a pointer at y: negative near the top, positive near the bottom, faster nearer. */
export function nextScroll(list: Rect, y: number): number {
  if (y < list.top + EDGE) {
    return -Math.ceil((MAX_STEP * Math.min(EDGE, list.top + EDGE - y)) / EDGE);
  }
  if (y > list.bottom - EDGE) {
    return Math.ceil((MAX_STEP * Math.min(EDGE, y - (list.bottom - EDGE))) / EDGE);
  }
  return 0;
}

export interface RailDragOptions {
  /** The list (its `ul`): the cards, their members and the drop line are looked for inside it. */
  listRef: RefObject<HTMLElement | null>;
  /** The project's groups: who is a member of which, to know what a drop changes. */
  groups: readonly Group[];
  /** No drag at all (the phone's sheet). */
  disabled?: boolean;
  /** A drop that changes something; a cancelled one, and one that changes nothing, never call it. */
  onDrop: (itemId: string, target: DropTarget) => void;
}

interface Session {
  itemId: string;
  pointerId: number;
  grip: HTMLElement;
  /** The row that lifts: the member's, or the ungrouped item's. */
  row: HTMLElement;
  start: { x: number; y: number };
  startScroll: number;
  /** The row's top in the page when the drag began (before it moved). */
  rowTop: number;
  last: { x: number; y: number };
  began: boolean;
  target: DropTarget | null;
  entered: HTMLElement | null;
  frame: number | null;
}

/** One group-card in the DOM, as its geometry reads it. */
const CARD = '[data-region="group-card"]';

/** Reads the list's rectangles from the DOM. */
function measure(root: HTMLElement): RailGeometry {
  const groups: GroupGeometry[] = [...root.querySelectorAll<HTMLElement>(CARD)].map((card) => {
    const rows = [...card.querySelectorAll<HTMLElement>("[data-member-id]")].map((li) => ({
      id: li.dataset.memberId ?? "",
      rect: li.getBoundingClientRect(),
    }));
    const body = card.querySelector<HTMLElement>(".gc-members, .gc-empty");
    const rect = card.getBoundingClientRect();
    return {
      id: card.dataset.groupId ?? "",
      rect,
      bodyTop: body?.getBoundingClientRect().top ?? rect.bottom,
      rows,
    };
  });
  return { list: root.getBoundingClientRect(), groups };
}

const reducedMotion = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The rail's drag (spec §7.3). `gripDown(id)` is a grip's `onPointerDown`: the drag begins after 4 px
 * of movement; the row then lifts (`is-lifted`: `--shadow-sheet`) and follows the pointer, a 2 px
 * `--focus` line marks the place, a group being entered takes `data-drop`; the list scrolls when the
 * pointer nears its top or bottom edge (a step per move under reduced motion, no animation).
 * Escape, and a drop outside the list, cancel.
 */
export function useRailDrag(options: RailDragOptions): {
  gripDown: (itemId: string) => (e: PointerEvent) => void;
} {
  const latest = useRef(options);
  latest.current = options;
  const session = useRef<Session | null>(null);
  const stop = useRef<(() => void) | null>(null);

  // the page goes while a drag is on (an editor opens, the rail unmounts): nothing is left behind
  useEffect(
    () => () => {
      stop.current?.();
    },
    [],
  );

  const gripDown = (itemId: string) => (e: PointerEvent) => {
    const { listRef, disabled } = latest.current;
    const root = listRef.current;
    const grip = e.currentTarget as HTMLElement | null;
    const row = grip?.closest("li");
    if (
      disabled === true ||
      root === null ||
      grip === null ||
      row === null ||
      row === undefined ||
      e.button !== 0 ||
      session.current !== null
    ) {
      return;
    }
    // no text selection and no focus move from a press that may become a drag
    e.preventDefault();
    try {
      grip.setPointerCapture?.(e.pointerId);
    } catch {
      // a pointer the browser no longer knows: the window's listeners are enough
    }
    const s: Session = {
      itemId,
      pointerId: e.pointerId,
      grip,
      row,
      start: { x: e.clientX, y: e.clientY },
      startScroll: root.scrollTop,
      rowTop: 0,
      last: { x: e.clientX, y: e.clientY },
      began: false,
      target: null,
      entered: null,
      frame: null,
    };
    session.current = s;

    // the drop line is made when the drag begins and goes with it: the list's markup has no trace of it
    let mark: HTMLElement | null = null;
    const line = (): HTMLElement | null => mark;
    const clearTarget = (): void => {
      s.entered?.removeAttribute("data-drop");
      s.entered = null;
      const l = line();
      if (l !== null) {
        l.hidden = true;
      }
    };
    const showTarget = (target: DropTarget | null, geometry: RailGeometry): void => {
      clearTarget();
      s.target = target;
      if (target === null || "out" in target) {
        return;
      }
      const own = latest.current.groups.find((g) => g.memberIds.includes(itemId));
      if (own?.id !== target.groupId) {
        s.entered =
          [...root.querySelectorAll<HTMLElement>(CARD)].find(
            (c) => c.dataset.groupId === target.groupId,
          ) ?? null;
        s.entered?.setAttribute("data-drop", "true");
      }
      const at = dragLineAt(geometry, target, itemId);
      const l = line();
      if (at !== null && l !== null) {
        const box = geometry.list;
        l.style.top = `${at.y - box.top + root.scrollTop - 1}px`;
        l.style.left = `${at.left - box.left + root.scrollLeft}px`;
        l.style.width = `${at.right - at.left}px`;
        l.hidden = false;
      }
    };
    /**
     * The row follows the pointer up and down (and the list's scroll), held by its top edge so the
     * line that marks the place (the pointer's) runs along the row's top and not through its text;
     * across, it stays in the list: the rail is as wide as a row, and one that left it would be cut
     * off. The target is what is under the pointer.
     */
    const update = (): void => {
      const dy = s.last.y - s.rowTop - HOLD + (root.scrollTop - s.startScroll);
      s.row.style.transform = `translateY(${dy}px)`;
      const geometry = measure(root);
      showTarget(hitTest(geometry, s.last, itemId), geometry);
    };
    const scrollStep = (): number => {
      const step = nextScroll(root.getBoundingClientRect(), s.last.y);
      if (step === 0) {
        return 0;
      }
      const before = root.scrollTop;
      root.scrollTop = before + step;
      return root.scrollTop - before;
    };
    const tick = (): void => {
      s.frame = null;
      if (scrollStep() !== 0) {
        update();
        s.frame = window.requestAnimationFrame(tick);
      }
    };
    const begin = (): void => {
      s.began = true;
      s.rowTop = s.row.getBoundingClientRect().top;
      s.row.classList.add("is-lifted");
      root.classList.add("is-dragging");
      mark = document.createElement("li");
      mark.className = "rail-dropline";
      mark.setAttribute("aria-hidden", "true");
      mark.hidden = true;
      root.append(mark);
    };
    const end = (): void => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("contextmenu", noMenu, true);
      window.removeEventListener("blur", cancel);
      if (s.frame !== null) {
        window.cancelAnimationFrame(s.frame);
      }
      clearTarget();
      mark?.remove();
      mark = null;
      s.row.classList.remove("is-lifted");
      s.row.style.transform = "";
      root.classList.remove("is-dragging");
      try {
        s.grip.releasePointerCapture?.(s.pointerId);
      } catch {
        // already let go
      }
      session.current = null;
      stop.current = null;
    };
    const move = (ev: PointerEvent): void => {
      if (ev.pointerId !== s.pointerId) {
        return;
      }
      s.last = { x: ev.clientX, y: ev.clientY };
      if (!s.began) {
        if (!pastThreshold(s.start, s.last)) {
          return;
        }
        begin();
      }
      ev.preventDefault();
      // reduced motion: a step per move, no animation frames
      if (reducedMotion()) {
        scrollStep();
      } else if (s.frame === null && nextScroll(root.getBoundingClientRect(), s.last.y) !== 0) {
        s.frame = window.requestAnimationFrame(tick);
      }
      update();
    };
    const up = (ev: PointerEvent): void => {
      if (ev.pointerId !== s.pointerId) {
        return;
      }
      s.last = { x: ev.clientX, y: ev.clientY };
      const target = s.began ? hitTest(measure(root), s.last, itemId) : null;
      end();
      if (target !== null && dropChange(latest.current.groups, itemId, target) !== "none") {
        latest.current.onDrop(itemId, target);
      }
    };
    const cancel = (): void => end();
    // a long press on a touch screen, or the secondary button, must not open a menu in the middle of a drag
    const noMenu = (ev: Event): void => ev.preventDefault();
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        // only the drag is cancelled: nothing else answers this Escape
        ev.preventDefault();
        ev.stopPropagation();
        end();
      }
    };
    stop.current = end;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("contextmenu", noMenu, true);
    window.addEventListener("blur", cancel);
  };

  return { gripDown };
}
