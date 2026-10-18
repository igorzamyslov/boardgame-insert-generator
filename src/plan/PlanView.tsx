// src/plan/PlanView.tsx
import { Fragment } from "preact";
import type { ComponentChildren, TargetedPointerEvent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { isLockable } from "../app/actions";
import { trayNames } from "../instructions/naming";
import { numberParts, partsByKey } from "../instructions/numbering";
import { Icon, KindGlyph } from "../kit";
import type { Box, Component, Settings, TraySpec } from "../model/types";
import { hoveredComponent } from "../screens/hover";
import { StageSlot } from "../screens/StageSlot";
import { componentIdsOfTray, sharingTrayWith } from "../ui/identity";
import { PHONE_QUERY, useMediaQuery } from "../ui/useMediaQuery";
import {
  footprintsAt,
  hitTest,
  largestOf,
  levelsOf,
  planFrame,
  toSvgRect,
  traysAt,
} from "./layers";
import { lookOfTray } from "./glyph";
import { DESKTOP_PILL, PHONE_PILL, hasPillRoom } from "./tileText";
import "./plan.css";

export const DRAG_THRESHOLD_PX = 6;

export interface PlanViewProps {
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  /** The components the trays hold: each tray takes the tint of its component's swatch. */
  components?: readonly Component[];
  lockedKeys: ReadonlySet<string>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onSwap: (keyA: string, keyB: string) => void;
  /** trayKeys with a size lock (shown as "size locked" on the tray). */
  sizeLockedKeys: ReadonlySet<string>;
  /** The inputs no longer match the layout. Main draws the plan as it is under its banner. */
  stale?: boolean;
  /** A search is running: the trays that are not pinned are dimmed, as Main draws it. */
  searching?: boolean;
  /** The tray bar, shown in the slot above the box while a tray is selected (the app owns it). */
  bar?: ComponentChildren;
  /**
   * The component whose editor is open (Edit): its trays are lifted and the rest dimmed, whatever
   * the pointer is on. The slot above the box is the editor's then (`bar`).
   */
  editedId?: string | null;
  /** Index of the layer shown (0 = the bottom layer); the app owns it. Clamped to the layers there are. */
  level: number;
  onLevelChange: (level: number) => void;
  /** The tray a "Swap with…" is under way from, or null; the app owns it. */
  swapFrom: string | null;
  onSwapFromChange: (key: string | null) => void;
  /**
   * A picture of a plan and nothing more (the fit problems, UI rebuild Task 12): no tile is a
   * control, nothing is selected, dragged or lit by the pointer, the slot above the box and the
   * note about pins are left out, and what hangs over the box's edge is cut at the frame.
   */
  readOnly?: boolean;
  /** Read-only: which tiles are drawn at 0.6 (every one but the marked, or every one that is not pinned). */
  dim?: "all" | "unpinned";
  /** Read-only: the tray that does not fit, drawn on top in the warn style with only its name. */
  misfitKey?: string | null;
}

/** What the layer switch calls layer `i` (0 = bottom) of `n`: no height, only the order. */
export function layerLabel(i: number, n: number): string {
  return `Layer ${i + 1}${i === 0 && n > 1 ? " (bottom)" : i === n - 1 && n > 1 ? " (top)" : ""}`;
}

/** What a tray is called to a screen reader: its name, its layer, and what is locked on it. */
function trayLabel(name: string, layer: number, pinned: boolean, sizeLocked: boolean): string {
  return `${name}, layer ${layer}${pinned ? ", pinned" : ""}${sizeLocked ? ", size locked" : ""}`;
}

/** The floor's width at Main's full size (a 582 px box less its 6 px floor inset each side), and a phone's before it is measured. */
const FLOOR_PX = 570;
const PHONE_FLOOR_PX = 346;
/** A tile is drawn 3 px inside its footprint, so neighbours are 6 px apart (Main). */
const TILE_GAP_PX = 6;

interface Drag {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** Only real trays can be swapped: a leftover or spacer can be tapped, not dragged. */
  swappable: boolean;
}

const NOTE_LEFTOVER_SOURCE =
  "Leftover trays and spacers can't be dragged. Tap one to select it, or drag a real tray.";
const NOTE_LEFTOVER_TARGET = "Leftover trays and spacers can't be swapped with.";
const NOTE_NO_TARGET = "Nothing was swapped: drop the tray onto another tray.";

/** Whether the keyboard focus ring should show (not after a mouse press); true if unsure. */
function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

type BoxPointer = TargetedPointerEvent<HTMLDivElement>;

const pct = (v: number): string => `${Math.round(v * 10000) / 10000}%`;

export function PlanView(props: PlanViewProps) {
  const {
    trays,
    box,
    settings,
    lockedKeys,
    selectedKey,
    onSelect,
    onSwap,
    sizeLockedKeys,
    swapFrom,
    onSwapFromChange: setSwapFrom,
    onLevelChange,
  } = props;
  const levels = levelsOf(trays);
  const idx = Math.max(0, Math.min(props.level, levels.length - 1));
  const level = levels[idx] ?? 0;
  // The app keeps the layer: bring it back in range when the layers shrink.
  useEffect(() => {
    if (props.level !== idx) {
      onLevelChange(idx);
    }
  }, [props.level, idx]);
  // A swap is from the selected tray: the selection moving away from it (or clearing), from
  // anywhere, ends it.
  useEffect(() => {
    if (swapFrom !== null && selectedKey !== swapFrom) {
      setSwapFrom(null);
    }
  }, [selectedKey, swapFrom]);
  const phone = useMediaQuery(PHONE_QUERY);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [swapRefused, setSwapRefused] = useState(false);
  // The tray bar starts a swap from outside: a refusal of the last one is no longer news.
  useEffect(() => {
    if (swapFrom === null) {
      setSwapRefused(false);
    }
  }, [swapFrom]);
  /** Why a drag cannot swap (or did not), shown next to the plan, not only as a tooltip. */
  const [dragNote, setDragNote] = useState<string | null>(null);
  /** The tray the pointer is on, and the tray with the keyboard focus ring: both light their component. */
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  /** The floor's width in px, for cutting names to their tiles; measured once the box is laid out. */
  const [floorPx, setFloorPx] = useState(phone ? PHONE_FLOOR_PX : FLOOR_PX);
  const dragRef = useRef<Drag | null>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  /** The component this view last pointed the rail at, so leaving (or going away) can clear it. */
  const pointedAt = useRef<string | null>(null);

  useEffect(() => {
    const floor = floorRef.current;
    if (!floor || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const read = (): void => {
      const w = floor.getBoundingClientRect().width;
      if (w > 0) {
        setFloorPx(w);
      }
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(floor);
    return () => observer.disconnect();
  }, []);
  useEffect(
    () => () => {
      if (pointedAt.current !== null && hoveredComponent.peek() === pointedAt.current) {
        hoveredComponent.value = null;
      }
    },
    [],
  );

  const frame = planFrame(box, settings);
  const numbered = numberParts(trays);
  const byKey = partsByKey(numbered);
  const components = props.components ?? [];
  const names = trayNames(numbered, components);
  const shown = traysAt(trays, level);
  const rects = shown.flatMap((t) =>
    footprintsAt(t, level).map((f) => ({ key: t.key, rect: toSvgRect(f, frame) })),
  );
  const pillType = phone ? PHONE_PILL : DESKTOP_PILL;
  const pxPerMm = floorPx / frame.innerW;

  /**
   * What a tray is lit with: the ids of every component it holds (a group shares one tray), or its
   * own key when it holds none (a spacer); null for a key that is no tray.
   */
  function identitiesOf(key: string | null): string[] | null {
    const t = key === null ? undefined : trays.find((s) => s.key === key);
    if (!t) {
      return null;
    }
    const ids = componentIdsOfTray(t, components);
    return ids.length > 0 ? ids : [t.key];
  }

  /** Points the rail at the tray's components (or takes them away): its first is the one the rail is told of, the rail lights the rest with it. */
  function light(key: string | null, on: boolean): void {
    const t = key === null ? undefined : trays.find((s) => s.key === key);
    const comp = t === undefined ? undefined : componentIdsOfTray(t, components)[0];
    if (comp === undefined) {
      return;
    }
    if (on) {
      pointedAt.current = comp;
      hoveredComponent.value = comp;
    } else if (hoveredComponent.peek() === comp) {
      hoveredComponent.value = null;
    }
  }

  // The component being pointed at (the rail's row, a tray, the keyboard focus), else the
  // selected tray's: its trays stay lit and the rest dim. What shares a tray with it lights with
  // it, a group being one tray in the plan; an editor lifts the trays of its component alone. A
  // search lights the pinned trays only.
  const readOnly = props.readOnly === true;
  const misfitKey = props.misfitKey ?? null;
  const searching = props.searching === true;
  const railId = hoveredComponent.value;
  const editedId = props.editedId ?? null;
  const withSharers = (ids: readonly string[]): Set<string> =>
    new Set(ids.flatMap((id) => [...sharingTrayWith(id, trays, components)]));
  const litWith = (key: string | null): Set<string> | null => {
    const ids = identitiesOf(key);
    return ids === null ? null : withSharers(ids);
  };
  const active: Set<string> | null =
    editedId !== null
      ? new Set([editedId])
      : railId !== null
        ? withSharers([railId])
        : (litWith(hoverKey) ?? litWith(focusKey) ?? litWith(selectedKey));
  const isActive = (key: string): boolean =>
    active !== null && (identitiesOf(key) ?? []).some((id) => active.has(id));
  const lightsSome =
    !readOnly && !searching && active !== null && shown.some((t) => isActive(t.key));

  function swappable(key: string | null): boolean {
    const part = key === null ? undefined : byKey.get(key);
    return part !== undefined && isLockable(part.spec);
  }

  function choose(key: string): void {
    if (swapFrom !== null && swapFrom !== key) {
      if (!swappable(key)) {
        setSwapRefused(true);
        return;
      }
      onSwap(swapFrom, key);
      setSwapRefused(false);
      setSwapFrom(null);
      onSelect(swapFrom);
      return;
    }
    setSwapFrom(null);
    setSwapRefused(false);
    setDragNote(null);
    onSelect(key === selectedKey ? null : key);
  }

  function keyAt(clientX: number, clientY: number): string | null {
    const floor = floorRef.current;
    if (!floor) {
      return null;
    }
    const r = floor.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) {
      return null;
    }
    // client pixels → the plan's mm (the floor is the box's inside; the plan starts the clearance in)
    const p = {
      x: ((clientX - r.left) / r.width) * frame.innerW - frame.bc,
      y: ((clientY - r.top) / r.height) * frame.innerD - frame.bc,
    };
    return hitTest(rects, p);
  }

  function clearSwap(): void {
    setSwapFrom(null);
    setSwapRefused(false);
    setDragNote(null);
  }

  function endDrag(): void {
    dragRef.current = null;
    setDragKey(null);
    setDropKey(null);
  }

  const onPointerDown = (e: BoxPointer): void => {
    if (e.button !== 0) {
      return;
    }
    // A second pointer (another finger) must not take over a drag that is under way. The same
    // pointer pressing again means its pointerup or pointercancel never arrived: start afresh.
    if (dragRef.current !== null) {
      if (dragRef.current.pointerId !== e.pointerId) {
        return;
      }
      endDrag();
    }
    setDragNote(null);
    const target = e.target instanceof Element ? e.target.closest("[data-key], [data-of]") : null;
    const key = target?.getAttribute("data-key") ?? target?.getAttribute("data-of") ?? null;
    if (key === null) {
      return;
    }
    const surface = e.currentTarget;
    if ("setPointerCapture" in surface) {
      try {
        surface.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety; the drag still works without it.
      }
    }
    dragRef.current = {
      key,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      swappable: swappable(key),
    };
  };

  const onPointerMove = (e: BoxPointer): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    const far = Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD_PX;
    if (!d.swappable && far) {
      setDragNote(NOTE_LEFTOVER_SOURCE);
    }
    if (d.swappable && !d.moved && far) {
      d.moved = true;
      setDragKey(d.key);
    }
    if (d.moved) {
      e.preventDefault();
      const over = keyAt(e.clientX, e.clientY);
      setDropKey(over !== d.key && swappable(over) ? over : null);
      setDragNote(
        over !== null && over !== d.key && !swappable(over) ? NOTE_LEFTOVER_TARGET : null,
      );
    }
  };

  const onPointerUp = (e: BoxPointer): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    endDrag();
    if (!d.moved) {
      // A press that moved on a leftover or spacer is neither a tap nor a drag.
      if (
        d.swappable ||
        Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= DRAG_THRESHOLD_PX
      ) {
        choose(d.key);
      }
      return;
    }
    const over = keyAt(e.clientX, e.clientY);
    if (over !== null && over !== d.key && swappable(over)) {
      setDragNote(null);
      onSwap(d.key, over);
      onSelect(d.key);
    } else if (over === null || over === d.key) {
      setDragNote(NOTE_NO_TARGET);
    }
  };

  const onKeyDown = (e: { key: string; preventDefault: () => void }, key: string): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(key);
    }
  };

  // Escape works wherever the focus is inside the plan (a tray, a button, the tray bar).
  const onPlanKeyDown = (e: { key: string }): void => {
    if (e.key === "Escape") {
      clearSwap();
      onSelect(null);
    }
  };

  const onPointerCancel = (e: BoxPointer): void => {
    if (dragRef.current?.pointerId === e.pointerId) {
      endDrag();
      setDragNote(null);
    }
  };

  const message =
    swapFrom !== null
      ? swapRefused
        ? "Spare trays and spacers can't be swapped. Choose another tray, or press Escape."
        : "Choose the tray to swap with, or press Escape."
      : dragNote;
  const hasBar = props.bar !== undefined && props.bar !== null && props.bar !== false;
  // A picture has no handlers: what a press, a key or the pointer could do is not there to do.
  const handlers = readOnly
    ? {}
    : {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onLostPointerCapture: onPointerCancel,
      };

  /** What makes a tile a control: a button with a name, a tab stop, and the pointer and focus lighting its component. */
  const control = (
    key: string,
    name: string,
    locked: boolean,
    sizeLocked: boolean,
    selected: boolean,
  ) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-pressed": selected,
    "aria-label": trayLabel(name, idx + 1, locked, sizeLocked),
    onKeyDown: (e: { key: string; preventDefault: () => void }) => onKeyDown(e, key),
    onFocus: (e: { currentTarget: Element }) => {
      if (isFocusVisible(e.currentTarget)) {
        setFocusKey(key);
        light(key, true);
      }
    },
    onBlur: () => {
      setFocusKey((k) => (k === key ? null : k));
      light(key, false);
    },
    onPointerEnter: (e: { pointerType: string }) => {
      // a touch has no hover: the tap that follows selects
      if (e.pointerType !== "touch") {
        setHoverKey(key);
        light(key, true);
      }
    },
    onPointerLeave: () => {
      setHoverKey((k) => (k === key ? null : k));
      light(key, false);
    },
  });

  return (
    <div class="plan" onKeyDown={readOnly ? undefined : onPlanKeyDown}>
      {readOnly ? null : (
        <StageSlot
          idle={phone && !hasBar && message === null}
          quiet={message !== null}
          live={
            // always mounted, so a reader hears a note arrive
            <div role="status">
              {swapFrom !== null ? (
                <p>{message}</p>
              ) : dragNote !== null ? (
                <p class="plan-note">{dragNote}</p>
              ) : null}
            </div>
          }
        >
          {props.bar}
        </StageSlot>
      )}
      <div
        class="plan-fit"
        style={{ "--box-w": String(frame.innerW), "--box-l": String(frame.innerD) }}
      >
        <div
          class="plan-box"
          data-region="plan-box"
          role="group"
          aria-label={`Plan of layer ${idx + 1} of ${Math.max(1, levels.length)}, seen from above, box front at the bottom`}
          data-readonly={readOnly ? "true" : undefined}
          {...handlers}
        >
          <div class="plan-floor" ref={floorRef}>
            {shown.map((t) => {
              const all = footprintsAt(t, level).map((f) => toSvgRect(f, frame));
              const r = largestOf(all) ?? toSvgRect(t, frame);
              const name = names.get(t.key)?.full ?? t.key;
              const locked = lockedKeys.has(t.key);
              const sizeLocked = sizeLockedKeys.has(t.key);
              const look = lookOfTray(t, components);
              const held = isActive(t.key);
              const lit = lightsSome && held;
              const lifted = editedId !== null && (identitiesOf(t.key) ?? []).includes(editedId);
              const misfit = readOnly && t.key === misfitKey;
              const dimmed = readOnly
                ? props.dim === undefined || misfit
                  ? false
                  : props.dim === "all" || !locked
                : searching
                  ? !locked
                  : lightsSome && !held;
              // The kind icon says what a tray holds when you point at it: the lit trays.
              const icon = look !== null && lit;
              // The pill shows the whole name and its CSS cuts it to the tile; here only whether there is room.
              const pill = hasPillRoom(
                name,
                { w: r.w * pxPerMm - TILE_GAP_PX, h: r.h * pxPerMm - TILE_GAP_PX },
                pillType,
                icon,
              );
              const cls = [
                "plan-tile",
                t.part === "leftover" ? "is-leftover" : "",
                t.key === selectedKey ? "is-selected" : "",
                lifted ? "is-lifted" : "",
                dimmed ? "is-dimmed" : "",
                t.key === dropKey ? "is-drop" : "",
                t.key === dragKey || t.key === swapFrom ? "is-source" : "",
                locked ? "is-locked" : "",
                sizeLocked ? "is-size-locked" : "",
                misfit ? "is-misfit" : "",
              ]
                .filter((c) => c !== "")
                .join(" ");
              const shade =
                look === null
                  ? {}
                  : {
                      "--tile-fill": look.shade.fill,
                      "--tile-line": look.shade.line,
                      "--tile-ink": look.shade.ink,
                    };
              // A footprint's place in the floor, as shares of the box's inside (the tile is drawn 3 px in).
              const place = (a: { x: number; y: number; w: number; h: number }) => ({
                "--x": pct(((frame.bc + a.x) / frame.innerW) * 100),
                "--y": pct(((frame.bc + a.y) / frame.innerD) * 100),
                "--w": pct((a.w / frame.innerW) * 100),
                "--d": pct((a.h / frame.innerD) * 100),
              });
              // The marked tray alone is cut to the frame, so its name is in sight whatever hangs over.
              const inFrame = (a: { x: number; y: number; w: number; h: number }) => {
                const left = Math.max(0, frame.bc + a.x);
                const top = Math.max(0, frame.bc + a.y);
                const right = Math.min(frame.innerW, frame.bc + a.x + a.w);
                const bottom = Math.min(frame.innerD, frame.bc + a.y + a.h);
                return {
                  x: left - frame.bc,
                  y: top - frame.bc,
                  w: Math.max(0, right - left),
                  h: Math.max(0, bottom - top),
                };
              };
              const selected = t.key === selectedKey;
              return (
                <Fragment key={t.key}>
                  {all
                    .filter((a) => a !== r)
                    .map((a, i) => (
                      <div
                        key={`${t.key}:${i}`}
                        data-of={t.key}
                        aria-hidden="true"
                        class={cls}
                        style={{ ...shade, ...place(a) }}
                      />
                    ))}
                  <div
                    key={t.key}
                    data-key={t.key}
                    class={cls}
                    style={{ ...shade, ...place(misfit ? inFrame(r) : r) }}
                    title={name}
                    {...(readOnly
                      ? { "aria-hidden": "true" }
                      : control(t.key, name, locked, sizeLocked, selected))}
                  >
                    {misfit ? (
                      <span class="plan-misfit">{name}</span>
                    ) : look !== null && t.part === "tray" && t.compartments.length > 0 ? (
                      <div class="plan-cells" aria-hidden="true">
                        {t.compartments.map((c, i) => (
                          <span
                            key={i}
                            class="plan-cell"
                            style={{
                              // tray-local, y from the front: the front is the bottom of the tile
                              left: pct((c.x / t.w) * 100),
                              top: pct(((t.d - c.y - c.d) / t.d) * 100),
                              width: pct((c.w / t.w) * 100),
                              height: pct((c.d / t.d) * 100),
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                    {pill && !misfit ? (
                      <span class="plan-center" aria-hidden="true">
                        <span class="plan-pill">
                          {icon && look !== null ? (
                            <KindGlyph kind={look.kind} size={pillType.icon} />
                          ) : null}
                          <span class="plan-name">{name}</span>
                        </span>
                      </span>
                    ) : null}
                    {locked ? (
                      <span class="plan-badge" role="img" aria-label="Pinned">
                        <Icon name="pin" size={13} />
                      </span>
                    ) : null}
                    {locked && t.rotated ? <span class="plan-tag">Turned</span> : null}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
      <p class="plan-caption">
        {phone ? (
          "Front of the box"
        ) : (
          <>
            {`${layerLabel(idx, levels.length)}, seen from above. Front of the box`}
            <Icon name="arrow-down" size={12} />
          </>
        )}
      </p>
      {lockedKeys.size > 0 && !readOnly ? (
        <p class="plan-pins">Spacers fill the gaps again when the plan updates.</p>
      ) : null}
      <ul class="visually-hidden" aria-label={`Trays on layer ${idx + 1}`}>
        {shown.map((t) => (
          <li key={t.key}>
            {`${names.get(t.key)?.full ?? t.key}${lockedKeys.has(t.key) ? ", pinned" : ""}${sizeLockedKeys.has(t.key) ? ", size locked" : ""}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
