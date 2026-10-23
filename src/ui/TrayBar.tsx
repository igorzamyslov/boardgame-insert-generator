// src/ui/TrayBar.tsx
// The tray bar (UI rebuild Task 8), from Main's `sel` state and MobileTray: what a selected tray
// is, and what can be done with it. On a desktop it is the bar in the stage's slot; on a phone it
// is a modal sheet at the foot of the screen.
import type { CSSProperties } from "preact";
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { isLockable, lockedKeys, sizeLockedKeys, stackOf, turnedKeys } from "../app/actions";
import { canTurn } from "../app/dryRun";
import type { MeshSource } from "../app/meshes";
import { printedHeight } from "../instructions/numbering";
import {
  Button,
  CloseButton,
  Dialog,
  GroupGlyph,
  Icon,
  IconTile,
  MenuItem,
  MenuPanel,
} from "../kit";
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
  /** Which layer it is on: "Layer 1 (bottom)". */
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
  /** The phone's modal sheet, not the bar in the stage's slot. */
  phone?: boolean;
  /** A "Swap with…" is under way from this tray. */
  swapping?: boolean;
  /** A "Put on…" is under way from this tray. */
  puttingOn?: boolean;
  onPin: () => void;
  onTurn: () => void;
  /** Only where a swap can be made (the plan): without it there is no Swap with…. */
  onSwap?: () => void;
  /** Only where a tray can be put on another (the plan): without it there is no Put on…. */
  onPutOn?: () => void;
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

/** What the bar knows about the tray: its rules, whether Turn can go, and the lines it says. */
function useTrayFacts(p: TrayBarProps) {
  const { project, tray, foreign } = p;
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
  // The filament of this part alone, from its built mesh, as the Download dialog counts it; the
  // line has none until the part is built (or when it cannot be, or no meshes were given).
  const built = p.buildSpec ?? tray;
  const alone = useMemo(() => [built], [built]);
  const filament = useFilament(
    full ? p.meshes : undefined,
    alone,
    project.settings,
    project.printer,
    { stale: p.stale === true },
  );
  const estimate = filament.status === "ready" ? formatGrams(filament.grams) : null;
  const size = `${mm(tray.w)} × ${mm(tray.d)} × ${mm(printedHeight(tray, project.settings))} mm`;
  const why = full && !turnCheck.ok ? turnCheck.reason : undefined;
  const stack = full ? stackOf(project, tray).length : 1;
  return { full, pinned, turned, sizeLocked, turnCheck, why, estimate, size, stack };
}

/** What Pin and Turn hold, in the button's words: this tray alone, or the stack it is in. */
function actionWords(stack: number, pinned: boolean) {
  const what = stack > 1 ? "stack" : "tray";
  return {
    pin: `${pinned ? "Unpin" : "Pin"} this ${what}`,
    turn: `Turn this ${what} 90°`,
    /** For a reader and the tooltip: how many trays the press holds. */
    count: stack > 1 ? `${stack} trays` : null,
  };
}

/** A button's words, with how many trays the press holds as words for a reader after them. */
function Words({ text, count }: { text: string; count: string | null }) {
  return (
    <>
      {text}
      {count === null ? null : <span class="visually-hidden">{`, ${count}`}</span>}
    </>
  );
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

interface MoreItemsProps {
  more: More;
  swapping: boolean;
  puttingOn: boolean;
  sizeLocked: boolean;
  onSwap?: () => void;
  onPutOn?: () => void;
  onToggleSizeLock: () => void;
}

/** The panel: Swap with… and Put on… (the plan only) and Lock size. */
function MoreItems(p: MoreItemsProps) {
  return (
    <div class="tray-more__panel" id={p.more.panelId}>
      <MenuPanel label="More about this tray">
        {p.onSwap ? (
          <MenuItem
            aria-pressed={p.swapping}
            class={p.swapping ? "is-on" : undefined}
            onClick={p.onSwap}
          >
            Swap with…
          </MenuItem>
        ) : null}
        {p.onPutOn ? (
          <MenuItem
            aria-pressed={p.puttingOn}
            class={p.puttingOn ? "is-on" : undefined}
            onClick={() => {
              p.onPutOn?.();
              p.more.close();
            }}
          >
            Put on…
          </MenuItem>
        ) : null}
        <MenuItem
          class={p.sizeLocked ? "is-on" : undefined}
          onClick={() => {
            p.onToggleSizeLock();
            p.more.close();
          }}
        >
          {p.sizeLocked ? "Unlock size" : "Lock size"}
        </MenuItem>
      </MenuPanel>
    </div>
  );
}

/**
 * The pin, the turn and the size lock, in words for a reader: the bar draws them in the buttons, not
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

/**
 * The bar in the stage's slot when a tray is selected, or the phone's sheet. A part the plan makes
 * to fit the trays around it (a spacer, a spare tray, a riser) has no actions: only Close. An
 * action that can't be taken stays on screen, off, with one line saying why.
 */
export function TrayBar(p: TrayBarProps) {
  const facts = useTrayFacts(p);
  // A put-on closes the panel (its prompt and its refusals are sentences the panel would cover); a swap keeps it open.
  const more = useMore(p.swapping === true);
  return p.phone === true ? (
    <PhoneSheet {...p} facts={facts} more={more} />
  ) : (
    <DesktopBar {...p} facts={facts} more={more} />
  );
}

type Facts = ReturnType<typeof useTrayFacts>;
type Inner = TrayBarProps & { facts: Facts; more: More };

function DesktopBar(p: Inner) {
  const { facts, more } = p;
  const words = actionWords(facts.stack, facts.pinned);
  // A group's line (G1): the size, how many compartments, then the cost; the layer first only with two.
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
        <span class="tray-bar__name" title={p.name}>
          {p.name}
        </span>
        <span class="tray-bar__meta" title={meta}>
          {meta}
        </span>
        {/* Always mounted, so a reader hears a pin or a size lock arrive. */}
        <Told pinned={facts.pinned} turned={facts.turned} sizeLocked={facts.sizeLocked} />
      </span>
      {facts.full ? (
        <>
          <Button
            variant="soft"
            data-on={facts.pinned ? "true" : undefined}
            icon={<Icon name="pin" size={15} />}
            title={words.count === null ? undefined : `${words.pin}: ${words.count}`}
            onClick={p.onPin}
          >
            <Words text={words.pin} count={words.count} />
          </Button>
          <Button
            variant="soft"
            icon={<Icon name="turn" size={15} />}
            title={words.count === null ? undefined : `${words.turn}: ${words.count}`}
            blockedReason={facts.turnCheck.ok ? undefined : facts.turnCheck.reason}
            onClick={p.onTurn}
          >
            <Words text={words.turn} count={words.count} />
          </Button>
          {p.onEdit ? (
            <Button variant="primary" class="tray-bar__edit" onClick={p.onEdit}>
              Edit
            </Button>
          ) : null}
          <span
            class="tray-more"
            ref={more.wrap}
            onKeyDown={more.onKeyDown}
            onBlurCapture={more.onBlurCapture}
          >
            <Button
              variant="quiet"
              ref={more.trigger}
              aria-expanded={more.open}
              aria-controls={more.open ? more.panelId : undefined}
              onClick={more.toggle}
            >
              More
              {facts.sizeLocked ? <span class="tray-more__dot" aria-hidden="true" /> : null}
            </Button>
            {more.open ? (
              <MoreItems
                more={more}
                swapping={p.swapping === true}
                puttingOn={p.puttingOn === true}
                sizeLocked={facts.sizeLocked}
                onSwap={p.onSwap}
                onPutOn={p.onPutOn}
                onToggleSizeLock={p.onToggleSizeLock}
              />
            ) : null}
          </span>
        </>
      ) : null}
      <CloseButton onClick={p.onClose} />
      {/* Always mounted: the sentence is read when it arrives; empty, it takes no room. */}
      <div class="tray-bar__why" aria-live="polite">
        {facts.why !== undefined ? <p>{facts.why}</p> : null}
      </div>
    </div>
  );
}

function PhoneSheet(p: Inner) {
  const { facts, more } = p;
  const words = actionWords(facts.stack, facts.pinned);
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const meta = facts.full
    ? [p.layer, p.compartments]
        .filter((part) => part !== null && part !== undefined && part !== "")
        .join(" · ")
    : partLine(p, facts.size);
  return (
    <Dialog
      labelledBy={titleId}
      onClose={p.onClose}
      placement="bottom"
      region="sheet"
      class={facts.full ? undefined : "tray-sheet--part"}
    >
      <div class="tray-sheet" style={shadeStyle(p.look)}>
        <span class="tray-sheet__handle" aria-hidden="true" />
        <div class="tray-sheet__head">
          {!p.look ? (
            <span class="tray-sheet__swatch" aria-hidden="true" />
          ) : p.look.group ? (
            <IconTile size={36} tone="group">
              <GroupGlyph size={18} />
            </IconTile>
          ) : (
            <IconTile size={36} kind={p.look.kind} lined />
          )}
          <div class="tray-sheet__title">
            <h2 id={titleId} ref={title} tabIndex={-1} class="ellipsis" title={p.name}>
              {p.name}
            </h2>
            <span class="tray-sheet__meta">{meta}</span>
          </div>
          <CloseButton onClick={p.onClose} />
        </div>
        {facts.full ? (
          <>
            {p.onEdit ? (
              <Button variant="primary" size="dialog" class="tray-sheet__edit" onClick={p.onEdit}>
                <span class="ellipsis">{`Edit ${p.name}`}</span>
              </Button>
            ) : null}
            <dl class="tray-sheet__dl">
              <dt>Size</dt>
              <dd>{facts.size}</dd>
              {facts.estimate !== null ? (
                <>
                  <dt>Filament</dt>
                  <dd>{facts.estimate}</dd>
                </>
              ) : null}
            </dl>
            <div class="tray-sheet__tiles">
              <Button
                variant="soft"
                class="tray-sheet__tile"
                data-on={facts.pinned ? "true" : undefined}
                icon={<Icon name="pin" size={20} />}
                title={words.count === null ? undefined : `${words.pin}: ${words.count}`}
                onClick={p.onPin}
              >
                <Words text={words.pin} count={words.count} />
              </Button>
              <Button
                variant="soft"
                class="tray-sheet__tile"
                icon={<Icon name="turn" size={20} />}
                title={words.count === null ? undefined : `${words.turn}: ${words.count}`}
                blockedReason={facts.turnCheck.ok ? undefined : facts.turnCheck.reason}
                onClick={p.onTurn}
              >
                <Words text={words.turn} count={words.count} />
              </Button>
              <span
                class="tray-more"
                ref={more.wrap}
                onKeyDown={more.onKeyDown}
                onBlurCapture={more.onBlurCapture}
              >
                <Button
                  variant="soft"
                  class="tray-sheet__tile"
                  ref={more.trigger}
                  aria-expanded={more.open}
                  aria-controls={more.open ? more.panelId : undefined}
                  icon={<Icon name="more" size={20} />}
                  onClick={more.toggle}
                >
                  More
                  {facts.sizeLocked ? <span class="tray-more__dot" aria-hidden="true" /> : null}
                </Button>
                {more.open ? (
                  <MoreItems
                    more={more}
                    swapping={p.swapping === true}
                    puttingOn={p.puttingOn === true}
                    sizeLocked={facts.sizeLocked}
                    onSwap={p.onSwap}
                    onPutOn={p.onPutOn}
                    onToggleSizeLock={p.onToggleSizeLock}
                  />
                ) : null}
              </span>
            </div>
            <Told pinned={facts.pinned} turned={facts.turned} sizeLocked={facts.sizeLocked} />
            <div class="tray-sheet__why" aria-live="polite">
              {facts.why !== undefined ? <p>{facts.why}</p> : null}
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
