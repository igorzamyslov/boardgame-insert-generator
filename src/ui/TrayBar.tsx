// src/ui/TrayBar.tsx
// The tray dock (board 4 of the 2026-10-23 review; the tray bar of UI rebuild Task 8 before it):
// what a selected tray is, and what can be done with it. It is docked at one fixed place, the bottom
// centre of the stage, and is the same in Top, in 3D and on a phone: Edit is the one button, ⋯ holds
// the rest, each with a line saying what it does, and the facts (layer, size, grams) are its label.
import type { CSSProperties } from "preact";
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { isLockable, lockedKeys, sizeLockedKeys, stackOf, turnedKeys } from "../app/actions";
import { canTurn } from "../app/dryRun";
import type { MeshSource } from "../app/meshes";
import { printedHeight } from "../instructions/numbering";
import { Button, CloseButton, FitText, Icon, IconButton, MenuItem, MenuPanel } from "../kit";
import type { ForeignData, Project, TraySpec } from "../model/types";
import type { TrayLook } from "../plan/glyph";
import { formatGrams } from "./estimates";
import { mm } from "./identity";
import type { Shade } from "./identity";
import { useFilament } from "./useFilament";
import "./trayBar.css";

export interface TrayBarProps {
  /** The project: its locks say what is pinned, and the dry run behind Turn reads its plan. */
  project: Project;
  /** What the file kept of components this app doesn't read; the dry run behind Turn validates with it. */
  foreign?: ForeignData;
  /** The selected part, as it prints. */
  tray: TraySpec;
  /** What the tray is called, in full. */
  name: string;
  /** Which layer it is on: "Layer 1". */
  layer: string;
  /** The component's kind and its own shade, for the swatch; none for a part that holds nothing. */
  look?: TrayLook | null;
  /**
   * A group's tray: its members' colours, in order, for the swatch drawn as a tiny tray (one cell
   * each, near-equal bars as G1 draws them).
   */
  cells?: readonly { shade: Shade }[];
  /** How many layers the plan has: a group's line names the layer only when there are two or more. */
  layerCount?: number;
  /** A riser carries a tray: its name. */
  carries?: string | null;
  /** The kinds the tray's wells hold, when it has several ("Oil, Metal, Wood, Food"): a line under the facts. */
  holds?: string | null;
  /** What the compartments are, in words: the phone's line ("6 figure pockets"), and a group's ("5 compartments"). */
  compartments?: string | null;
  /** Where the part's mesh comes from, for the filament line; without it the bar gives none. */
  meshes?: MeshSource;
  /**
   * The spec the part is built from (with its engraved name, as the viewer and the export ask for
   * it), so the filament line shares their cached mesh. Defaults to `tray`.
   */
  buildSpec?: TraySpec;
  /** The plan is out of date: nothing is built for the filament line until it is current. */
  stale?: boolean;
  /** A "Swap with…" is under way from this tray. */
  swapping?: boolean;
  /** A "Put on…" is under way from this tray. */
  puttingOn?: boolean;
  onPin: () => void;
  onTurn: () => void;
  /** Starts or ends a "Swap places with…" (both views pick the other tray). */
  onSwap: () => void;
  /** Starts or ends a "Put on…". */
  onPutOn: () => void;
  onToggleSizeLock: () => void;
  /** Only for a tray that holds a component: opens that component's editor. */
  onEdit?: () => void;
  onClose: () => void;
}

/** The colours of the swatch or the tile: the component's own shade, as custom properties. */
function shadeStyle(look: TrayLook | null | undefined): CSSProperties | undefined {
  return !look
    ? undefined
    : ({
        "--shade-fill": look.shade.fill,
        "--shade-line": look.shade.line,
        "--shade-ink": look.shade.ink,
      } as CSSProperties);
}

/** The swatch of a group's tray: a tiny tray, a neutral tile with a cell per member in the member's colours. */
function GroupSwatch({ cells }: { cells: NonNullable<TrayBarProps["cells"]> }) {
  // G1 draws near-equal bars: a member's cell is as wide as any other's, whatever its compartments' area
  const columns = cells.map(() => "1fr").join(" ");
  return (
    <span
      class="tray-bar__swatch tray-bar__swatch--group"
      aria-hidden="true"
      style={{ gridTemplateColumns: columns } as CSSProperties}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          class="tray-bar__cell"
          style={
            { "--cell-own-fill": c.shade.fill, "--cell-own-line": c.shade.line } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** What the tray is under (pin, turn, size lock, stack) and whether Turn can go: the ⋯ menu's facts. */
function useTrayRules(project: Project, tray: TraySpec, foreign?: ForeignData) {
  const full = isLockable(tray);
  const pin = project.locks.find((l) => l.kind === "position" && l.trayKey === tray.key);
  const pinned = lockedKeys(project).has(tray.key);
  // a pin says whether it holds the tray turned; a tray that is not pinned is turned by its turn lock
  const turned = pin?.kind === "position" ? pin.rotated : turnedKeys(project).has(tray.key);
  const sizeLocked = sizeLockedKeys(project).has(tray.key);
  const turnCheck = useMemo(
    () => (full ? canTurn(project, tray.key, foreign) : { ok: false as const, reason: "" }),
    [project, tray.key, full, foreign],
  );
  const why = full && !turnCheck.ok ? turnCheck.reason : undefined;
  const stack = full ? stackOf(project, tray).length : 1;
  return { full, pinned, turned, sizeLocked, turnCheck, why, stack };
}

/** What the bar knows about the tray: its rules, and the lines it says. */
function useTrayFacts(p: TrayBarProps) {
  const { project, tray, foreign } = p;
  const rules = useTrayRules(project, tray, foreign);
  // The filament of this part alone, from its built mesh, as the Download dialog counts it; the
  // line has none until the part is built (or when it cannot be, or no meshes were given).
  const built = p.buildSpec ?? tray;
  const alone = useMemo(() => [built], [built]);
  const filament = useFilament(
    rules.full ? p.meshes : undefined,
    alone,
    project.settings,
    project.printer,
    { stale: p.stale === true },
  );
  const estimate = filament.status === "ready" ? formatGrams(filament.grams) : null;
  const size = `${mm(tray.w)} × ${mm(tray.d)} × ${mm(printedHeight(tray, project.settings))} mm`;
  return { ...rules, estimate, size };
}

/** How many trays a press holds, in words: a stack is held whole. */
function stackWords(stack: number): { them: string } {
  return { them: stack > 1 ? `these ${stack} trays` : "it" };
}

/** The line a part with no actions says about itself. */
function partLine(p: TrayBarProps, size: string): string {
  if (p.tray.part === "riser") {
    return p.carries ? `Carries ${p.carries} · ${size}` : size;
  }
  return `Fills the gap so the trays can't slide. Print it too. ${size}`;
}

/** More: a quiet control that opens a small panel with what the bar keeps out of sight. */
function useMore(swapping: boolean) {
  const [open, setOpen] = useState(swapping);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusFirst = useRef(false);
  const panelId = useId();
  // A swap under way keeps the panel open on its pressed item, whoever started it, and shuts with it.
  const wasSwapping = useRef(swapping);
  useEffect(() => {
    if (wasSwapping.current !== swapping) {
      setOpen(swapping);
      wasSwapping.current = swapping;
    }
  }, [swapping]);
  useEffect(() => {
    if (open && focusFirst.current) {
      wrap.current?.querySelector<HTMLElement>(".k-menu button")?.focus();
    }
    focusFirst.current = false;
  }, [open]);
  // A click outside it shuts it, as the project menu's does.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onClick = (e: MouseEvent): void => {
      const inside = wrap.current !== null && e.composedPath().includes(wrap.current);
      if (!inside) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);
  const close = (): void => {
    setOpen(false);
    trigger.current?.focus();
  };
  return {
    open,
    panelId,
    wrap,
    trigger,
    /** The trigger's press. */
    toggle: (): void => {
      focusFirst.current = !open;
      setOpen(!open);
    },
    close,
    /**
     * On the wrapper: Escape shuts the panel and nothing else (not the selection, not the sheet).
     * While a swap is chosen it is the plan's: it ends the swap, as the prompt says.
     */
    onKeyDown: (e: KeyboardEvent): void => {
      if (open && !swapping && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    },
    /** On the wrapper: the focus left it, so the panel goes (the focus stays where it went). */
    onBlurCapture: (e: FocusEvent): void => {
      const to = e.relatedTarget;
      if (open && to instanceof Node && !wrap.current?.contains(to)) {
        setOpen(false);
      }
    },
  };
}

type More = ReturnType<typeof useMore>;

/** One entry of the ⋯ menu: its name over the line that says what it does. */
function Entry(p: { name: string; line: string }) {
  return (
    <>
      <span>{p.name}</span>
      <span class="tray-more__line">{p.line}</span>
    </>
  );
}

interface MoreItemsProps {
  more: More;
  facts: Rules;
  swapping: boolean;
  puttingOn: boolean;
  onPin: () => void;
  onTurn: () => void;
  onSwap: () => void;
  onPutOn: () => void;
  onToggleSizeLock: () => void;
}

/**
 * The ⋯ menu: Keep here (the pin), Rotate 90°, Swap places with…, Put on…, and, set apart, Keep this
 * size. A pin or a size lock that is on says so in its name and in what it does.
 */
function MoreItems(p: MoreItemsProps) {
  const { facts } = p;
  const held = stackWords(facts.stack);
  return (
    <div class="tray-more__panel" id={p.more.panelId}>
      <MenuPanel label="More about this tray">
        <MenuItem
          class={`tray-more__item${facts.pinned ? " is-on" : ""}`}
          aria-pressed={facts.pinned}
          onClick={p.onPin}
        >
          <Entry
            name={facts.pinned ? "Unpin" : "Keep here"}
            line={
              facts.pinned
                ? `The plan may move ${held.them} again`
                : `The plan will not move ${held.them}`
            }
          />
        </MenuItem>
        <MenuItem
          class="tray-more__item"
          blockedReason={facts.turnCheck.ok ? undefined : facts.turnCheck.reason}
          onClick={p.onTurn}
        >
          <Entry
            name="Rotate 90°"
            line={facts.pinned ? "Stays where it is kept" : "Stays free to move"}
          />
        </MenuItem>
        <MenuItem
          class={`tray-more__item${p.swapping ? " is-on" : ""}`}
          aria-pressed={p.swapping}
          onClick={p.onSwap}
        >
          <Entry name="Swap places with…" line="Then pick the other tray" />
        </MenuItem>
        <MenuItem
          class={`tray-more__item${p.puttingOn ? " is-on" : ""}`}
          aria-pressed={p.puttingOn}
          onClick={() => {
            p.onPutOn();
            p.more.close();
          }}
        >
          <Entry name="Put on…" line="Stands it on another tray" />
        </MenuItem>
        <MenuItem
          class={`tray-more__item tray-more__item--apart${facts.sizeLocked ? " is-on" : ""}`}
          onClick={() => {
            p.onToggleSizeLock();
            p.more.close();
          }}
        >
          <Entry
            name={facts.sizeLocked ? "Let the size change" : "Keep this size"}
            line={facts.sizeLocked ? "The plan may resize it" : "The plan will not resize it"}
          />
        </MenuItem>
      </MenuPanel>
    </div>
  );
}

/**
 * The pin, the turn and the size lock, in words for a reader: the dock draws them in the menu, not
 * in chips. A tray that is turned and not pinned is "Turned"; a pin says whether it holds the turn.
 */
function Told(p: { pinned: boolean; turned: boolean; sizeLocked: boolean }) {
  return (
    <span class="visually-hidden" aria-live="polite">
      {p.pinned ? <span>{p.turned ? "Pinned, turned" : "Pinned"}</span> : null}
      {!p.pinned && p.turned ? <span>Turned</span> : null}
      {p.sizeLocked ? <span>Size locked</span> : null}
    </span>
  );
}

type Rules = ReturnType<typeof useTrayRules>;

export interface TrayMoreProps {
  /** The project: its locks say what is pinned, and the dry run behind Turn reads its plan. */
  project: Project;
  foreign?: ForeignData;
  /** The part the menu is about. */
  tray: TraySpec;
  /** A "Swap places with…" is under way from this tray. */
  swapping?: boolean;
  /** A "Put on…" is under way from this tray. */
  puttingOn?: boolean;
  /** The panel opens above the button (the dock, at the foot) or below it (an editor's head). */
  opens?: "up" | "down";
  onPin: () => void;
  onTurn: () => void;
  onSwap: () => void;
  onPutOn: () => void;
  onToggleSizeLock: () => void;
}

/**
 * The ⋯ button of a tray and its menu: Keep here, Rotate 90°, Swap places with…, Put on…, Keep this
 * size. One component for the dock and for an item's editor, so the placement actions are the same
 * wherever they are offered. Nothing for a part the plan makes to fit the others.
 */
export function TrayMore(p: TrayMoreProps) {
  const rules = useTrayRules(p.project, p.tray, p.foreign);
  const more = useMore(p.swapping === true);
  if (!rules.full) {
    return null;
  }
  return (
    <span
      class={`tray-more${p.opens === "down" ? " tray-more--down" : ""}`}
      ref={more.wrap}
      onKeyDown={more.onKeyDown}
      onBlurCapture={more.onBlurCapture}
    >
      {/* Always mounted, so a reader hears a pin or a size lock arrive. */}
      <Told pinned={rules.pinned} turned={rules.turned} sizeLocked={rules.sizeLocked} />
      <IconButton
        variant="outlined"
        label="More about this tray"
        ref={more.trigger}
        dot={rules.pinned || rules.sizeLocked}
        aria-expanded={more.open}
        aria-controls={more.open ? more.panelId : undefined}
        icon={<Icon name="more" size={18} />}
        onClick={more.toggle}
      />
      {more.open ? (
        <MoreItems
          more={more}
          facts={rules}
          swapping={p.swapping === true}
          puttingOn={p.puttingOn === true}
          onPin={p.onPin}
          onTurn={p.onTurn}
          onSwap={p.onSwap}
          onPutOn={p.onPutOn}
          onToggleSizeLock={p.onToggleSizeLock}
        />
      ) : null}
    </span>
  );
}

/**
 * The dock of the selected tray. A part the plan makes to fit the trays around it (a spacer, a
 * spare tray, a riser) has no actions: only its line and Close. An action that can't be taken stays
 * in the menu, off, with one line saying why.
 */
export function TrayBar(p: TrayBarProps) {
  const facts = useTrayFacts(p);
  // A group's line (G1): the size, how many compartments, then the grams; the layer first only with two.
  const group = p.look?.group === true;
  const meta = facts.full
    ? (group
        ? [(p.layerCount ?? 1) > 1 ? p.layer : null, facts.size, p.compartments, facts.estimate]
        : [p.layer, facts.size, facts.estimate]
      )
        .filter((part) => part !== null && part !== undefined && part !== "")
        .join(" · ")
    : partLine(p, facts.size);
  return (
    <div
      class="tray-bar"
      role="region"
      aria-label="Selected tray"
      data-region="tray-bar"
      style={shadeStyle(p.look)}
      onKeyDown={(e) => {
        // The dock is outside the plan: Escape with the focus here ends a swap or a put-on too.
        if (e.key === "Escape" && p.swapping === true) {
          e.preventDefault();
          p.onSwap();
        } else if (e.key === "Escape" && p.puttingOn === true) {
          e.preventDefault();
          p.onPutOn();
        }
      }}
    >
      {group && p.cells !== undefined && p.cells.length > 0 ? (
        <GroupSwatch cells={p.cells} />
      ) : (
        <span
          class={`tray-bar__swatch${p.look ? "" : " tray-bar__swatch--spacer"}`}
          aria-hidden="true"
        />
      )}
      <span class="tray-bar__text">
        <FitText class="tray-bar__name" title={p.name}>
          {p.name}
        </FitText>
        <FitText class="tray-bar__meta" title={meta}>
          {meta}
        </FitText>
        {p.holds ? (
          <FitText class="tray-bar__meta tray-bar__holds" title={p.holds}>
            {p.holds}
          </FitText>
        ) : null}
      </span>
      {facts.full ? (
        <>
          {p.onEdit ? (
            <Button variant="primary" class="tray-bar__edit" onClick={p.onEdit}>
              Edit
            </Button>
          ) : null}
          <TrayMore
            project={p.project}
            foreign={p.foreign}
            tray={p.tray}
            swapping={p.swapping}
            puttingOn={p.puttingOn}
            onPin={p.onPin}
            onTurn={p.onTurn}
            onSwap={p.onSwap}
            onPutOn={p.onPutOn}
            onToggleSizeLock={p.onToggleSizeLock}
          />
        </>
      ) : null}
      <CloseButton onClick={p.onClose} />
    </div>
  );
}
