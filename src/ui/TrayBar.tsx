// src/ui/TrayBar.tsx
import type { ComponentChildren } from "preact";
import { useId, useMemo } from "preact/hooks";
import { isLockable, lockedKeys, sizeLockedKeys } from "../app/actions";
import { canTurn } from "../app/dryRun";
import { STALE_MESSAGE } from "../app/state";
import { outerSizeText } from "../instructions/numbering";
import { summarize } from "../layout";
import type { Project, TraySpec } from "../model/types";
import { formatPrintTime } from "./Summary";

export interface TrayBarProps {
  /** The project: its locks say what is pinned, and the dry run behind Turn reads its plan. */
  project: Project;
  /** The selected part, as it prints. */
  tray: TraySpec;
  /** What the tray is called, in full. */
  name: string;
  /** Which layer it is on: "Layer 1 (bottom)". */
  layer: string;
  /** What a spacer or riser goes with: "Sits on" / "Carries" and the tray's name. */
  relation?: { label: string; name: string } | null;
  /** The inputs no longer match the layout: the sizes shown use the current settings. */
  stale?: boolean;
  /** A "Swap with…" is under way from this tray. */
  swapping?: boolean;
  onPin: () => void;
  onTurn: () => void;
  /** Only where a swap can be made (the plan): without it there is no Swap button. */
  onSwap?: () => void;
  onToggleSizeLock: () => void;
  /** Only for a tray that holds a component: opens that component's editor. */
  onEdit?: () => void;
  onClose: () => void;
}

/** The reason every action is off for a part the plan makes to fit the trays around it. */
const FOLLOWS_TRAYS =
  "Spare trays, spacers and risers follow the trays around them, so they can't be pinned, turned or swapped.";

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

const GLYPHS = {
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 7 3 3v2H7v-2l3-3z" />
    </>
  ),
  turn: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </>
  ),
  swap: (
    <>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h14" />
      <path d="m17 20 4-4-4-4" />
      <path d="M21 16H7" />
    </>
  ),
  size: (
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
} as const;

function Icon({ name }: { name: keyof typeof GLYPHS }) {
  return <svg {...ICON}>{GLYPHS[name]}</svg>;
}

/** What a merged part is made of, and how it prints. */
function mergedText(t: TraySpec): string {
  const members = t.merged?.members ?? [];
  const risers = members.filter((m) => m.part === "riser").length;
  const spacers = members.length - risers;
  const noun = `${spacers} ${spacers === 1 ? "spacer" : "spacers"}`;
  const joined = risers > 0 ? `${noun} and ${risers === 1 ? "a riser" : `${risers} risers`}` : noun;
  return t.merged?.flipped
    ? `${joined}. Print it upside down, the flat top on the bed, so nothing hangs.`
    : `${joined}, printed as one piece.`;
}

/** Filament and time to print this part alone, from the same rough model as the summary. */
function printEstimate(p: Project, t: TraySpec): string | null {
  try {
    const s = summarize([t], {
      box: p.box,
      printer: p.printer,
      settings: p.settings,
      locks: p.locks,
    });
    return `≈ ${Math.max(1, Math.round(s.filamentAtInfillG))} g · ≈ ${formatPrintTime(s.printMinutes)}`;
  } catch {
    return null;
  }
}

interface ActionProps {
  icon: keyof typeof GLYPHS;
  label: string;
  /** A toggle that keeps its name (Swap with…) says which way it is set. */
  pressed?: boolean;
  /** An action whose label is the action itself (Pin, Unpin) is styled on when it is set. */
  on?: boolean;
  /** Why the action is off, with the id of the sentence that says so. */
  blocked?: string;
  onClick: () => void;
  children?: ComponentChildren;
}

/** A button that stays in the Tab order when it is off, so its reason can be read. */
function Action({ icon, label, pressed, on, blocked, onClick }: ActionProps) {
  return (
    <button
      type="button"
      class="tray-bar__action"
      aria-pressed={pressed}
      data-on={on === true ? "true" : undefined}
      aria-disabled={blocked === undefined ? undefined : "true"}
      aria-describedby={blocked}
      onClick={() => {
        if (blocked === undefined) {
          onClick();
        }
      }}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

/**
 * The bar under the box when a tray is selected: what it is, and what can be done with it. An
 * action that can't be taken stays on screen, off, with one line saying why.
 */
export function TrayBar(p: TrayBarProps) {
  const { project, tray } = p;
  const whyId = useId();
  const lockable = isLockable(tray);
  const pin = project.locks.find((l) => l.kind === "position" && l.trayKey === tray.key);
  const pinned = lockedKeys(project).has(tray.key);
  const turned = pin?.kind === "position" && pin.rotated;
  const sizeLocked = sizeLockedKeys(project).has(tray.key);
  const turnCheck = useMemo(
    () => (lockable ? canTurn(project, tray.key) : { ok: false }),
    [project, tray.key, lockable],
  );
  const why = lockable ? (turnCheck.ok ? undefined : turnCheck.reason) : FOLLOWS_TRAYS;
  const off = (blocked: boolean): string | undefined =>
    blocked && why !== undefined ? whyId : undefined;
  const contents = tray.compartments.filter((c) => c.contents !== "").map((c) => c.contents);
  const estimate = useMemo(() => printEstimate(project, tray), [project, tray]);
  return (
    <div class="tray-bar" role="group" aria-label="Selected tray">
      <div class="tray-bar__head">
        <h3>{p.name}</h3>
        {/* Always mounted, so a reader hears a pin or a size lock appear. */}
        <span class="tray-bar__chips" aria-live="polite">
          {pinned ? (
            <span class="tray-bar__chip">{turned ? "Pinned, turned" : "Pinned"}</span>
          ) : null}
          {sizeLocked ? <span class="tray-bar__chip">Size locked</span> : null}
        </span>
        <button type="button" class="tray-bar__close" aria-label="Close" onClick={p.onClose}>
          <Icon name="close" />
        </button>
      </div>
      {p.stale ? <p class="hint">{`${STALE_MESSAGE} The sizes shown may not match.`}</p> : null}
      <dl>
        <div>
          <dt>Layer</dt>
          <dd>{p.layer}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{outerSizeText(tray, project.settings)}</dd>
        </div>
        {tray.merged ? (
          <div>
            <dt>Joins</dt>
            <dd>{mergedText(tray)}</dd>
          </div>
        ) : null}
        {p.relation ? (
          <div>
            <dt>{p.relation.label}</dt>
            <dd>{p.relation.name}</dd>
          </div>
        ) : null}
        {estimate !== null ? (
          <div>
            <dt>To print</dt>
            <dd>{estimate}</dd>
          </div>
        ) : null}
        {contents.length > 0 ? (
          <div class="tray-bar__contents">
            <dt>Holds</dt>
            <dd title={contents.join(", ")}>{contents.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      <div class="tray-bar__foot">
        <div class="tray-bar__actions">
          <Action
            icon="pin"
            label={pinned ? "Unpin" : "Pin"}
            on={pinned}
            blocked={off(!lockable)}
            onClick={p.onPin}
          />
          <Action icon="turn" label="Turn 90°" blocked={off(!turnCheck.ok)} onClick={p.onTurn} />
          {p.onSwap ? (
            <Action
              icon="swap"
              label="Swap with…"
              pressed={p.swapping === true}
              blocked={off(!lockable)}
              onClick={p.onSwap}
            />
          ) : null}
          <Action
            icon="size"
            label={sizeLocked ? "Unlock size" : "Lock size"}
            on={sizeLocked}
            blocked={off(!lockable)}
            onClick={p.onToggleSizeLock}
          />
          {p.onEdit ? <Action icon="edit" label="Edit" onClick={p.onEdit} /> : null}
        </div>
        <div aria-live="polite">
          {why !== undefined ? (
            <p class="hint tray-bar__why" id={whyId}>
              {why}
            </p>
          ) : null}
        </div>
        {why === undefined ? (
          <p class="hint">A size lock holds this size whenever a new plan is made.</p>
        ) : null}
      </div>
    </div>
  );
}
