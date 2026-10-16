// src/plan/PlanView.tsx
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { isLockable } from "../app/actions";
import { trayNames } from "../instructions/naming";
import { numberParts, partsByKey } from "../instructions/numbering";
import type { Box, Component, Settings, TraySpec } from "../model/types";
import { KIND_GLYPHS } from "../ui/kindGlyphs";
import { TrayDetails } from "../ui/TrayDetails";
import {
  clientToSvg,
  footprintsAt,
  hitTest,
  largestOf,
  levelsOf,
  planFrame,
  planViewBox,
  toSvgRect,
  traysAt,
} from "./layers";
import { lookOfTray } from "./glyph";
import { layoutTileText, sizeText } from "./tileText";
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
  onToggleLock: (key: string) => void;
  /** trayKeys with a size lock (shown as "size locked" on the tray). */
  sizeLockedKeys: ReadonlySet<string>;
  onToggleSizeLock: (key: string) => void;
  /** The inputs no longer match the layout: the plan is greyed out and the details say so. */
  stale?: boolean;
  /** Index of the layer shown (0 = the bottom layer); the app owns it. Clamped to the layers there are. */
  level: number;
  onLevelChange: (level: number) => void;
  /** The tray a "Swap with…" is under way from, or null; the app owns it. */
  swapFrom: string | null;
  onSwapFromChange: (key: string | null) => void;
}

/** What the layer switch calls layer `i` (0 = bottom) of `n`: no height, only the order. */
export function layerLabel(i: number, n: number): string {
  return `Layer ${i + 1}${i === 0 && n > 1 ? " (bottom)" : i === n - 1 && n > 1 ? " (top)" : ""}`;
}

/** What a tray is called to a screen reader: its name, its layer, and what is locked on it. */
function trayLabel(name: string, layer: number, pinned: boolean, sizeLocked: boolean): string {
  return `${name}, layer ${layer}${pinned ? ", pinned" : ""}${sizeLocked ? ", size locked" : ""}`;
}

/** Side of a tile's kind glyph, in SVG units, and the room it needs. */
const GLYPH_SIZE = 6;
const GLYPH_MIN_TILE = 14;

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

type SvgPointer = JSX.TargetedPointerEvent<SVGSVGElement>;

export function PlanView(props: PlanViewProps) {
  const {
    trays,
    box,
    settings,
    lockedKeys,
    selectedKey,
    onSelect,
    onSwap,
    onToggleLock,
    sizeLockedKeys,
    onToggleSizeLock,
    swapFrom,
    onSwapFromChange: setSwapFrom,
    onLevelChange,
  } = props;
  const levels = levelsOf(trays);
  const idx = Math.max(0, Math.min(props.level, levels.length - 1));
  const level = levels[idx] ?? 0;
  const belowLevel = idx > 0 ? levels[idx - 1] : undefined;
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
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [swapRefused, setSwapRefused] = useState(false);
  /** Why a drag cannot swap (or did not), shown next to the plan, not only as a tooltip. */
  const [dragNote, setDragNote] = useState<string | null>(null);
  /** The tray with the keyboard focus ring (drawn last so no neighbour paints over it). */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const frame = planFrame(box, settings);
  const vb = planViewBox(frame);
  const numbered = numberParts(trays);
  const byKey = partsByKey(numbered);
  const names = trayNames(numbered, props.components ?? []);
  const shown = traysAt(trays, level);
  const below = belowLevel === undefined ? [] : traysAt(trays, belowLevel);
  const components = props.components ?? [];
  const hasLeftover = trays.some((t) => t.part === "leftover");
  const rects = shown.flatMap((t) =>
    footprintsAt(t, level).map((f) => ({ key: t.key, rect: toSvgRect(f, frame) })),
  );
  const selectedPart = selectedKey === null ? null : (byKey.get(selectedKey) ?? null);

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
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    const p = clientToSvg(svg.getBoundingClientRect(), vb, clientX, clientY);
    return p ? hitTest(rects, p) : null;
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

  const onPointerDown = (e: SvgPointer): void => {
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
    const target = e.target instanceof Element ? e.target.closest("[data-key]") : null;
    const key = target?.getAttribute("data-key") ?? null;
    if (key === null) {
      return;
    }
    const svg = e.currentTarget;
    if ("setPointerCapture" in svg) {
      try {
        svg.setPointerCapture(e.pointerId);
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

  const onPointerMove = (e: SvgPointer): void => {
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

  const onPointerUp = (e: SvgPointer): void => {
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

  // Escape works wherever the focus is inside the plan (a tray, a button, the layer picker).
  const onPlanKeyDown = (e: { key: string }): void => {
    if (e.key === "Escape") {
      clearSwap();
      onSelect(null);
    }
  };

  const onPointerCancel = (e: SvgPointer): void => {
    if (dragRef.current?.pointerId === e.pointerId) {
      endDrag();
      setDragNote(null);
    }
  };

  const stale = props.stale === true;

  /** A ring drawn above every tile (SVG has no z-index), so a neighbour never covers it. */
  function ringOf(key: string | null, cls: string): JSX.Element | null {
    const t = key === null ? undefined : shown.find((s) => s.key === key);
    if (!t) {
      return null;
    }
    return (
      <>
        {footprintsAt(t, level).map((f, i) => {
          const r = toSvgRect(f, frame);
          return (
            <rect
              key={i}
              class={`plan-ring ${cls}`}
              aria-hidden="true"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={Math.max(0, Math.min(settings.cornerRadius, r.w / 4, r.h / 4))}
            />
          );
        })}
      </>
    );
  }
  const selectedLocked = selectedPart !== null && lockedKeys.has(selectedPart.spec.key);

  return (
    <div class="plan" onKeyDown={onPlanKeyDown}>
      {levels.length > 1 ? (
        <fieldset class="layer-picker">
          <legend class="pf-visually-hidden">Layer</legend>
          <div class="pf-seg">
            {levels.map((l, i) => (
              <label key={l} class="pf-seg__opt">
                <input
                  type="radio"
                  class="pf-visually-hidden"
                  name="plan-layer"
                  checked={i === idx}
                  onChange={() => onLevelChange(i)}
                />
                {layerLabel(i, levels.length)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <svg
        ref={svgRef}
        class={stale ? "plan-svg is-stale" : "plan-svg"}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="group"
        aria-label={`Plan of layer ${idx + 1} of ${Math.max(1, levels.length)}, seen from above, box front at the bottom`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
      >
        <defs>
          <pattern
            id="plan-hatch"
            width="3"
            height="3"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect class="plan-hatch-ground" width="3" height="3" />
            <line class="plan-hatch-line" x1="0" y1="0" x2="0" y2="3" />
          </pattern>
        </defs>
        <rect
          class="plan-box"
          x={-frame.bc}
          y={-frame.bc}
          width={frame.innerW}
          height={frame.innerD}
        />
        {below.flatMap((t) =>
          footprintsAt(t, belowLevel ?? 0).map((f, i) => {
            const r = toSvgRect(f, frame);
            return (
              <rect
                key={`below-${t.key}-${i}`}
                class="plan-below"
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
              />
            );
          }),
        )}
        {shown.map((t) => {
          const all = footprintsAt(t, level).map((f) => toSvgRect(f, frame));
          const r = largestOf(all) ?? toSvgRect(t, frame);
          const name = names.get(t.key)?.full ?? t.key;
          const locked = lockedKeys.has(t.key);
          const sizeLocked = sizeLockedKeys.has(t.key);
          const look = lookOfTray(t, components);
          const text = layoutTileText(r, name, sizeText(t.w, t.d));
          const cls = [
            "plan-tray",
            t.part === "leftover" ? "is-leftover" : "",
            t.key === selectedKey ? "is-selected" : "",
            t.key === dropKey ? "is-drop" : "",
            t.key === dragKey || t.key === swapFrom ? "is-source" : "",
            locked ? "is-locked" : "",
            sizeLocked ? "is-size-locked" : "",
          ]
            .filter((c) => c !== "")
            .join(" ");
          // The kind icon says what a tray holds when you point at it: the selected tray and the
          // one with the keyboard focus. Every tray carrying one all the time is noise.
          const glyph =
            look !== null &&
            (t.key === selectedKey || t.key === focusKey) &&
            r.w >= GLYPH_MIN_TILE &&
            r.h >= GLYPH_MIN_TILE
              ? KIND_GLYPHS[look.kind]
              : null;
          return (
            <g
              key={t.key}
              data-key={t.key}
              class={cls}
              style={
                look === null
                  ? undefined
                  : {
                      "--tile-fill": look.shade.fill,
                      "--tile-line": look.shade.line,
                      "--tile-ink": look.shade.ink,
                    }
              }
              role="button"
              tabIndex={0}
              aria-pressed={t.key === selectedKey}
              aria-label={trayLabel(name, idx + 1, locked, sizeLocked)}
              onKeyDown={(e) => onKeyDown(e, t.key)}
              onFocus={(e) => {
                setFocusKey(isFocusVisible(e.currentTarget) ? t.key : null);
              }}
              onBlur={() => setFocusKey((k) => (k === t.key ? null : k))}
            >
              <title>{name}</title>
              {all.map((a, i) => (
                <rect
                  key={i}
                  class="plan-face"
                  x={a.x}
                  y={a.y}
                  width={a.w}
                  height={a.h}
                  rx={Math.max(0, Math.min(settings.cornerRadius, a.w / 4, a.h / 4))}
                />
              ))}
              {text.pill ? (
                <rect
                  class="plan-pill"
                  aria-hidden="true"
                  x={text.pill.x}
                  y={text.pill.y}
                  width={text.pill.w}
                  height={text.pill.h}
                  rx={text.pill.h / 2}
                />
              ) : null}
              {text.name ? (
                <text
                  class="plan-name"
                  aria-hidden="true"
                  x={r.x + r.w / 2}
                  y={text.name.y}
                  style={{ fontSize: `${text.fontSize}px` }}
                >
                  {text.name.text}
                </text>
              ) : null}
              {text.size ? (
                <text
                  class="plan-size"
                  aria-hidden="true"
                  x={r.x + r.w / 2}
                  y={text.size.y}
                  style={{ fontSize: `${text.sizeFontSize}px` }}
                >
                  {text.size.text}
                </text>
              ) : null}
              {glyph ? (
                <g
                  class="plan-glyph"
                  aria-hidden="true"
                  transform={`translate(${r.x + 2} ${r.y + 2}) scale(${GLYPH_SIZE / 24})`}
                >
                  {glyph}
                </g>
              ) : null}
              {locked ? (
                <text
                  class="plan-lock plan-lock--end"
                  aria-hidden="true"
                  x={r.x + r.w - 2}
                  y={r.y + 5}
                >
                  pinned
                </text>
              ) : null}
              {sizeLocked ? (
                <text class="plan-lock" aria-hidden="true" x={r.x + 2} y={r.y + r.h - 5}>
                  size locked
                </text>
              ) : null}
            </g>
          );
        })}
        {ringOf(selectedKey, "is-selected")}
        {ringOf(focusKey, "is-focus")}
        <text class="plan-front" x={frame.usableW / 2} y={frame.usableD + frame.bc + 9}>
          FRONT
        </text>
      </svg>
      <ul class="pf-visually-hidden" aria-label={`Trays on layer ${idx + 1}`}>
        {shown.map((t) => (
          <li key={t.key}>
            {`${names.get(t.key)?.full ?? t.key}${lockedKeys.has(t.key) ? ", pinned" : ""}${sizeLockedKeys.has(t.key) ? ", size locked" : ""}`}
          </li>
        ))}
      </ul>
      {hasLeftover ? (
        <p class="hint plan-legend">
          Hatched trays are spares: they fill the gap so the other trays stay put. Print them too.
        </p>
      ) : null}
      <div class="plan-toolbar">
        <p class="hint">Select a tray to see its details. Drag a tray onto another to swap them.</p>
        {swapFrom !== null ? (
          <p role="status">
            {swapRefused
              ? "Leftover trays and spacers can't be swapped. Choose another tray, or press Escape."
              : "Choose the tray to swap with, or press Escape."}
          </p>
        ) : dragNote !== null ? (
          <p role="status" class="plan-note">
            {dragNote}
          </p>
        ) : null}
        {selectedPart ? (
          <>
            <TrayDetails
              part={selectedPart}
              settings={settings}
              locked={selectedLocked}
              sizeLocked={sizeLockedKeys.has(selectedPart.spec.key)}
              stale={props.stale}
              onToggleSizeLock={() => onToggleSizeLock(selectedPart.spec.key)}
            />
            <div class="button-row">
              <button
                type="button"
                aria-pressed={swapFrom !== null}
                disabled={!isLockable(selectedPart.spec)}
                onClick={() => {
                  setSwapRefused(false);
                  setSwapFrom(swapFrom === null ? selectedPart.spec.key : null);
                }}
              >
                Swap with…
              </button>
              <button
                type="button"
                disabled={!isLockable(selectedPart.spec)}
                onClick={() => onToggleLock(selectedPart.spec.key)}
              >
                {selectedLocked ? "Unlock position" : "Lock position"}
              </button>
              {!isLockable(selectedPart.spec) ? (
                <span class="hint">Leftover trays and spacers can't be locked.</span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
