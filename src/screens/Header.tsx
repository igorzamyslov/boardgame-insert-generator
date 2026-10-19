// src/screens/Header.tsx
import type { ComponentChildren, Ref } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SaveState } from "../app/state";
import { Button, Icon, IconButton } from "../kit";
import { SavedStatus } from "../ui/SavedStatus";
import { historyTitle, isMacPlatform } from "../ui/historyKeys";
import { menuNoticeCount } from "../ui/noticePlacement";

export interface HeaderProps {
  name: string;
  onRename: (name: string) => void;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDownload: () => void;
  /** The Download button, so the app can hand the focus back to it. */
  downloadRef?: Ref<HTMLButtonElement>;
  downloadDisabled: boolean;
  /** Why Download is off (the button's title and description), e.g. "Make a new plan first". */
  downloadReason?: string;
  /** The blocked button was pressed (it stays focusable, so it can be): a way to show the way out. */
  onBlockedDownload?: () => void;
  /** What the button says (default "Download"); "Fix the fit to download" while the plan doesn't fit. */
  downloadLabel?: string;
  /** Something inside the project menu needs a look: the button wears a dot. */
  menuDot: boolean;
  /** How many notices wait in the menu: the button's name says it (1 when only `menuDot` is set). */
  menuNoticeCount?: number;
  /** The menu's content; `close` shuts the menu (after a choice). */
  menu: (close: () => void) => ComponentChildren;
  /** Below 760 px: the phone's header (MobileWorkspace). */
  phone: boolean;
  /** Phone: hands the file to the share sheet. */
  onSendFile: () => void;
}

/** Four squares, one in each kind's colour: the insert's pieces (Main's logo). */
export function Logo() {
  return (
    <span class="hd-logo" aria-hidden="true">
      <span class="hd-logo__cards" />
      <span class="hd-logo__bits" />
      <span class="hd-logo__tiles" />
      <span class="hd-logo__minis" />
    </span>
  );
}

/**
 * The project name. A button (name and pencil) until it is pressed, then a field that commits as
 * it is typed: Enter ends it, Escape goes back to what the name was when editing began, and
 * leaving the field trims it.
 */
function NameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  /** What the name was when editing began: Escape goes back to it. */
  const atStart = useRef(name);
  /** Ending is done once, whichever of Enter, Escape and blur comes first. */
  const ended = useRef(true);
  /** Enter and Escape put the focus back on the button; a click elsewhere leaves it there. */
  const refocus = useRef(false);
  useEffect(() => {
    setText(name);
  }, [name]);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [editing]);
  const end = (focusButton: boolean): void => {
    if (ended.current) {
      return;
    }
    ended.current = true;
    refocus.current = focusButton;
    setEditing(false);
  };
  if (!editing) {
    return (
      <button
        type="button"
        class="hd-name"
        ref={button}
        title="Rename this insert"
        onClick={() => {
          atStart.current = name;
          ended.current = false;
          setText(name);
          setEditing(true);
        }}
      >
        <span class={name === "" ? "hd-name__text hd-name__text--none" : "hd-name__text"}>
          {name === "" ? "(unnamed)" : name}
        </span>
        <Icon name="pencil" size={14} />
      </button>
    );
  }
  return (
    <input
      class="hd-name__input"
      ref={input}
      type="text"
      aria-label="Project name"
      placeholder="(unnamed)"
      value={text}
      onInput={(e) => {
        setText(e.currentTarget.value);
        onRename(e.currentTarget.value);
      }}
      onBlur={() => {
        const trimmed = text.trim();
        if (trimmed !== text) {
          setText(trimmed);
          onRename(trimmed);
        }
        end(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const trimmed = text.trim();
          if (trimmed !== text) {
            onRename(trimmed);
          }
          end(true);
        } else if (e.key === "Escape") {
          if (text !== atStart.current) {
            onRename(atStart.current);
          }
          end(true);
        }
      }}
    />
  );
}

export interface HeaderMenuProps {
  /** The menu's content; `close` shuts the menu (after a choice). */
  menu: (close: () => void) => ComponentChildren;
  /** Something inside needs a look: the button wears a dot. */
  menuDot: boolean;
  /** How many notices wait in the menu: the button's name says it (1 when only `menuDot` is set). */
  menuNoticeCount?: number;
  phone: boolean;
  /** `outlined` beside Download; `plain` beside the first visit's Open file. */
  variant?: "outlined" | "plain";
}

/**
 * The project menu's button and its panel, a disclosure (DESIGN §5): opening puts the focus on the
 * first item; Escape, a click outside or the focus leaving closes it, and Escape or a choice hands
 * the focus back to the button. In the workspace's header and in the first visit's.
 */
export function HeaderMenu(p: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /**
   * A choice made with Enter hands the focus to the button, and the browser sends that Enter's click
   * (keydown, keypress, click: one task) to whatever has the focus then: the button, which would open
   * the menu again behind what the choice opened (Settings' drawer took a hidden menu item as its
   * opener and lost the focus when it closed). That one click is dropped, within a moment of the key
   * going down and no longer: nothing waits on a key coming up, so the person's next real click
   * is never lost. Space clicks on key-up, after the choice, and is not affected.
   */
  const enterAt = useRef(0);
  const dropUntil = useRef(0);
  const DROP_MS = 80;
  /** Shuts the menu and puts the focus back on its button. */
  const close = (): void => {
    const now = Date.now();
    dropUntil.current = now - enterAt.current < DROP_MS ? now + DROP_MS : 0;
    setOpen(false);
    button.current?.focus();
  };
  // Opening moves the focus to the first item. A layout effect: a plain one waits for the next frame,
  // and a person (or a test) who keys on in that time would have the focus taken from where they put it.
  useLayoutEffect(() => {
    if (open) {
      panel.current?.querySelector<HTMLElement>("button, input, [href]")?.focus();
    }
  }, [open]);
  // The menu closes on a click outside it and on Escape (the focus goes back to its button).
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onClick = (e: MouseEvent) => {
      // A choice inside the menu may replace its own button (Your inserts swaps the page) before
      // this listener runs: the path, taken when the click was sent, still names the menu.
      const inside = wrap.current !== null && e.composedPath().includes(wrap.current);
      if (e.target instanceof Node && !inside && !wrap.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      class="hd-menu"
      ref={wrap}
      // on the menu's own element, not the document: the app has one document keydown listener
      onKeyDownCapture={(e) => {
        if (e.key === "Enter") {
          enterAt.current = Date.now();
        }
      }}
      onBlurCapture={(e) => {
        // The focus went somewhere outside the menu (Tab past its end, say): it closes and
        // leaves the focus where it went. A focus that went nowhere is the click handler's.
        const to = e.relatedTarget;
        if (open && to instanceof Node && !wrap.current?.contains(to)) {
          setOpen(false);
        }
      }}
    >
      <IconButton
        ref={button}
        variant={p.variant ?? "outlined"}
        label={`Project menu${menuNoticeCount(p.menuNoticeCount ?? (p.menuDot ? 1 : 0))}`}
        icon={<Icon name="more" size={p.phone ? 20 : 18} />}
        dot={p.menuDot}
        aria-expanded={open}
        aria-controls={open ? "project-menu" : undefined}
        onClick={() => {
          if (Date.now() < dropUntil.current) {
            dropUntil.current = 0;
            return;
          }
          setOpen(!open);
        }}
      />
      {open ? (
        <div class="hd-menu__panel" id="project-menu" ref={panel}>
          {p.menu(close)}
        </div>
      ) : null}
    </div>
  );
}

/** The bar on top: Main's header (desktop) and MobileWorkspace's (phone). */
export function Header(p: HeaderProps) {
  const mac = isMacPlatform(typeof navigator === "undefined" ? undefined : navigator);
  // Every screen has an h1 of its own (the status heading, the first visit's), so this is a span.
  const wordmark = p.phone ? null : <span class="hd-wordmark">Insert Generator</span>;
  const undo = (
    <IconButton
      label="Undo"
      icon={<Icon name="undo" size={p.phone ? 20 : 18} />}
      blockedReason={p.canUndo ? undefined : "Nothing to undo"}
      aria-keyshortcuts="Control+Z Meta+Z"
      title={p.canUndo ? historyTitle("undo", mac) : "Nothing to undo"}
      onClick={p.onUndo}
    />
  );
  const menuButton = (
    <HeaderMenu
      menu={p.menu}
      menuDot={p.menuDot}
      menuNoticeCount={p.menuNoticeCount}
      phone={p.phone}
    />
  );
  const download = p.downloadDisabled ? p.downloadReason : undefined;
  // A reason that is the button's own words ("Fix the fit to download") is not said a second time.
  const describedBy = p.downloadReason === p.downloadLabel ? "" : (p.downloadReason ?? "");

  if (p.phone) {
    return (
      <div class="hd hd--phone">
        <Logo />
        {wordmark}
        <div class="hd-who">
          <NameField name={p.name} onRename={p.onRename} />
          <SavedStatus state={p.saveState} />
        </div>
        {undo}
        <IconButton
          label="Send file"
          icon={<Icon name="send" size={20} />}
          onClick={p.onSendFile}
        />
        {menuButton}
        <IconButton
          ref={p.downloadRef}
          variant="primary"
          // an icon: named Download whatever is wrong, and the reason is its title (MobileFix)
          label="Download"
          icon={<Icon name="download" size={20} />}
          blockedReason={p.downloadDisabled ? (p.downloadReason ?? "") : undefined}
          onBlockedClick={p.onBlockedDownload}
          title={download}
          aria-haspopup="dialog"
          onClick={p.onDownload}
        />
      </div>
    );
  }
  return (
    <div class="hd">
      <Logo />
      {wordmark}
      <span class="hd-divider" aria-hidden="true" />
      <NameField name={p.name} onRename={p.onRename} />
      <SavedStatus state={p.saveState} />
      <span class="hd-grow" />
      {undo}
      <IconButton
        label="Redo"
        icon={<Icon name="redo" />}
        blockedReason={p.canRedo ? undefined : "Nothing to redo"}
        aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"
        title={p.canRedo ? historyTitle("redo", mac) : "Nothing to redo"}
        onClick={p.onRedo}
      />
      {menuButton}
      <Button
        ref={p.downloadRef}
        variant="primary"
        icon={<Icon name="download" size={16} />}
        blockedReason={p.downloadDisabled ? describedBy : undefined}
        onBlockedClick={p.onBlockedDownload}
        title={download}
        aria-haspopup="dialog"
        onClick={p.onDownload}
      >
        {p.downloadLabel ?? "Download"}
      </Button>
    </div>
  );
}
