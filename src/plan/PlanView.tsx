// src/plan/PlanView.tsx
import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { isLockable } from "../app/actions";
import { numberParts, partsByKey } from "../instructions/numbering";
import type { Box, Settings, TraySpec } from "../model/types";
import { TrayDetails } from "../ui/TrayDetails";
import {
  clientToSvg,
  hitTest,
  labelFontSize,
  levelsOf,
  planFrame,
  planViewBox,
  toSvgRect,
  traysAt,
} from "./layers";
import "./plan.css";

export const DRAG_THRESHOLD_PX = 6;

export interface PlanViewProps {
  trays: readonly TraySpec[];
  box: Box;
  settings: Settings;
  lockedKeys: ReadonlySet<string>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onSwap: (keyA: string, keyB: string) => void;
  onToggleLock: (key: string) => void;
  /** trayKeys with a size lock (shown as "size locked" on the tray). */
  sizeLockedKeys: ReadonlySet<string>;
  onToggleSizeLock: (key: string) => void;
}

interface Drag {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
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
  } = props;
  const levels = levelsOf(trays);
  const [levelIndex, setLevelIndex] = useState(0);
  const idx = Math.min(levelIndex, Math.max(0, levels.length - 1));
  const level = levels[idx] ?? 0;
  const belowLevel = idx > 0 ? levels[idx - 1] : undefined;
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const frame = planFrame(box, settings);
  const vb = planViewBox(frame);
  const byKey = partsByKey(numberParts(trays));
  const shown = traysAt(trays, level);
  const below = belowLevel === undefined ? [] : traysAt(trays, belowLevel);
  const rects = shown.map((t) => ({ key: t.key, rect: toSvgRect(t, frame) }));
  const selectedPart = selectedKey === null ? null : (byKey.get(selectedKey) ?? null);

  function choose(key: string): void {
    if (swapFrom !== null && swapFrom !== key) {
      onSwap(swapFrom, key);
      setSwapFrom(null);
      onSelect(swapFrom);
      return;
    }
    setSwapFrom(null);
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

  function endDrag(): void {
    dragRef.current = null;
    setDragKey(null);
    setDropKey(null);
  }

  const onPointerDown = (e: SvgPointer): void => {
    if (e.button !== 0) {
      return;
    }
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
    };
  };

  const onPointerMove = (e: SvgPointer): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD_PX) {
      d.moved = true;
      setDragKey(d.key);
    }
    if (d.moved) {
      e.preventDefault();
      const over = keyAt(e.clientX, e.clientY);
      setDropKey(over !== d.key ? over : null);
    }
  };

  const onPointerUp = (e: SvgPointer): void => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    endDrag();
    if (!d.moved) {
      choose(d.key);
      return;
    }
    const over = keyAt(e.clientX, e.clientY);
    if (over !== null && over !== d.key) {
      onSwap(d.key, over);
      onSelect(d.key);
    }
  };

  const onKeyDown = (e: { key: string; preventDefault: () => void }, key: string): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(key);
    } else if (e.key === "Escape") {
      setSwapFrom(null);
      onSelect(null);
    }
  };

  const selectedLocked = selectedPart !== null && lockedKeys.has(selectedPart.spec.key);

  return (
    <div class="plan">
      {levels.length > 1 ? (
        <fieldset class="layer-picker">
          <legend>Layer</legend>
          {levels.map((l, i) => (
            <label key={l}>
              <input
                type="radio"
                name="plan-layer"
                checked={i === idx}
                onChange={() => setLevelIndex(i)}
              />
              {i === 0 ? "1 (bottom)" : String(i + 1)}
            </label>
          ))}
        </fieldset>
      ) : null}
      <svg
        ref={svgRef}
        class="plan-svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="group"
        aria-label={`Plan of layer ${idx + 1} of ${Math.max(1, levels.length)}, seen from above, box front at the bottom`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
      >
        <rect
          class="plan-box"
          x={-frame.bc}
          y={-frame.bc}
          width={frame.innerW}
          height={frame.innerD}
        />
        {below.map((t) => {
          const r = toSvgRect(t, frame);
          return (
            <rect
              key={`below-${t.key}`}
              class="plan-below"
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
            />
          );
        })}
        {shown.map((t) => {
          const r = toSvgRect(t, frame);
          const part = byKey.get(t.key);
          const n = part ? part.number : 0;
          const locked = lockedKeys.has(t.key);
          const sizeLocked = sizeLockedKeys.has(t.key);
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
          return (
            <g
              key={t.key}
              data-key={t.key}
              class={cls}
              role="button"
              tabIndex={0}
              aria-pressed={t.key === selectedKey}
              aria-label={`Tray ${n}: ${part ? part.label : t.key}${locked ? ", locked" : ""}${sizeLocked ? ", size locked" : ""}`}
              onKeyDown={(e) => onKeyDown(e, t.key)}
            >
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx={Math.max(0, Math.min(settings.cornerRadius, r.w / 4, r.h / 4))}
              />
              <text
                class="plan-label"
                x={r.x + r.w / 2}
                y={r.y + r.h / 2}
                style={{ fontSize: `${labelFontSize(r)}px` }}
              >
                {n}
              </text>
              {locked ? (
                <text class="plan-lock" x={r.x + 2} y={r.y + 5}>
                  locked
                </text>
              ) : null}
              {sizeLocked ? (
                <text class="plan-lock" x={r.x + 2} y={r.y + r.h - 5}>
                  size locked
                </text>
              ) : null}
            </g>
          );
        })}
        <text class="plan-front" x={frame.usableW / 2} y={frame.usableD + frame.bc + 9}>
          FRONT
        </text>
      </svg>
      <div class="plan-toolbar">
        <p class="hint">
          Tap a tray to select it. Drag a tray onto another to swap them, or select one and use
          “Swap with…”. Swapped trays are locked in place, then the layout is re-optimized.
        </p>
        {swapFrom !== null ? (
          <p role="status">Choose the tray to swap with, or press Escape.</p>
        ) : null}
        {selectedPart ? (
          <>
            <TrayDetails
              part={selectedPart}
              settings={settings}
              locked={selectedLocked}
              sizeLocked={sizeLockedKeys.has(selectedPart.spec.key)}
              onToggleSizeLock={() => onToggleSizeLock(selectedPart.spec.key)}
            />
            <div class="button-row">
              <button
                type="button"
                aria-pressed={swapFrom !== null}
                disabled={selectedPart.spec.part === "spacer"}
                onClick={() => setSwapFrom(swapFrom === null ? selectedPart.spec.key : null)}
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
