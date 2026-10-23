// src/kit/Dialog.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { useEffect } from "preact/hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import css from "./kit.css?raw";
import { Dialog, Drawer } from "./Dialog";

// jsdom has no showModal: the real one opens the dialog and traps the focus; this stub opens it.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});
afterEach(() => {
  cleanup();
  showModal.mockClear();
  close.mockClear();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("Dialog", () => {
  it("opens as a modal dialog named by its heading", () => {
    render(
      <Dialog labelledBy="dl-title" onClose={() => undefined}>
        <h2 id="dl-title">Ready to print</h2>
      </Dialog>,
    );
    expect(showModal).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog", { name: "Ready to print", hidden: true });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.classList.contains("k-dialog")).toBe(true);
  });

  it("asks to close on Escape and leaves the decision to the owner", () => {
    const onClose = vi.fn();
    render(
      <Dialog labelledBy="t" onClose={onClose}>
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    const dialog = document.querySelector("dialog");
    const cancel = new Event("cancel", { cancelable: true });
    dialog?.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("gives the focus back to what opened it", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(
      <Dialog labelledBy="t" onClose={() => undefined}>
        <h2 id="t">Title</h2>
        <button type="button">Inside</button>
      </Dialog>,
    );
    screen.getByRole("button", { name: "Inside", hidden: true }).focus();
    view.unmount();
    expect(close).toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("opens before its children's effects run, so they can take the focus", () => {
    const order: string[] = [];
    showModal.mockImplementationOnce(function (this: HTMLDialogElement) {
      order.push("open");
      this.setAttribute("open", "");
    });
    function Child() {
      useEffect(() => {
        order.push("child");
      }, []);
      return <h2 id="t">Title</h2>;
    }
    render(
      <Dialog labelledBy="t" onClose={() => undefined}>
        <Child />
      </Dialog>,
    );
    expect(order).toEqual(["open", "child"]);
  });

  it("is shown open, without the trap, where showModal is missing", () => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    render(
      <Dialog labelledBy="t" onClose={() => undefined}>
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  });

  it("takes an extra class for its size", () => {
    render(
      <Dialog labelledBy="t" class="settings" onClose={() => undefined}>
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    expect(document.querySelector("dialog")?.classList.contains("settings")).toBe(true);
  });

  it("has no Close row of its own: the board's Close is a button in the content", () => {
    render(
      <Dialog labelledBy="t" onClose={() => undefined}>
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: "Close", hidden: true })).toBeNull();
  });
});

describe("Dialog, at the foot of a phone's screen", () => {
  it("is the modal sheet, named by the region the screenshots look for", () => {
    render(
      <Dialog labelledBy="t" placement="bottom" region="sheet" onClose={() => undefined}>
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    const dialog = document.querySelector("dialog");
    expect(dialog?.classList.contains("k-sheetmodal")).toBe(true);
    expect(dialog?.classList.contains("k-dialog")).toBe(false);
    expect(dialog?.getAttribute("data-region")).toBe("sheet");
    expect(css).toMatch(/\.k-sheetmodal::backdrop\s*{[^}]*background:\s*transparent/);
  });

  it("closes on a press on the dialog itself (what is behind it), not on one inside", () => {
    const onClose = vi.fn();
    render(
      <Dialog labelledBy="t" placement="bottom" onClose={onClose}>
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("heading", { name: "Title", hidden: true }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("dialog") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves a centred dialog alone: a press on its edge does nothing", () => {
    const onClose = vi.fn();
    render(
      <Dialog labelledBy="t" onClose={onClose}>
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    fireEvent.click(document.querySelector("dialog") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Dialog, legacy look", () => {
  it("keeps the old classes and its Close row, for the screens not rebuilt yet", () => {
    const onClose = vi.fn();
    render(
      <Dialog legacy labelledBy="t" onClose={onClose}>
        <h2 id="t">Title</h2>
      </Dialog>,
    );
    const dialog = document.querySelector("dialog");
    expect(dialog?.classList.contains("modal")).toBe(true);
    expect(dialog?.classList.contains("k-dialog")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Close", hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Drawer", () => {
  it("is a dialog that slides in from the right", () => {
    render(
      <Drawer labelledBy="t" onClose={() => undefined}>
        <h1 id="t">Settings</h1>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog", { name: "Settings", hidden: true });
    expect(dialog.classList.contains("k-drawer")).toBe(true);
    expect(showModal).toHaveBeenCalledTimes(1);
  });
});

describe("the dialog's styles", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector: string): string =>
    [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel = ""]) =>
      sel
        .replace(/@media[^{]*\{/, "")
        .split(",")
        .map((x) => x.trim())
        .includes(selector),
    )?.[2] ?? "";

  it("draws the board's dialog: radius 22, padding 32, a dialog shadow, at most 560 wide", () => {
    const body = rule(".k-dialog");
    expect(body).toMatch(/border-radius:\s*var\(--r-dialog\)/);
    expect(body).toMatch(/padding:\s*var\(--dialog-pad\)/);
    expect(body).toMatch(/box-shadow:\s*var\(--shadow-dialog\)/);
    expect(body).toMatch(/var\(--dialog-max\)/);
    // The page shows, dimmed, behind a dialog (the owner found a hidden page disorienting).
    expect(rule(".k-dialog::backdrop")).toMatch(/background:\s*var\(--scrim-see\)/);
  });

  it("draws the drawer on the right, full height, with the drawer shadow", () => {
    const body = rule(".k-drawer");
    expect(body).toMatch(/box-shadow:\s*var\(--shadow-drawer\)/);
    expect(body).toMatch(/var\(--dialog-max\)/);
    // Settings' board shows the plan dimmed behind the drawer, not hidden.
    expect(rule(".k-drawer::backdrop")).toMatch(/background:\s*var\(--scrim-see\)/);
  });

  it("fills the screen below 600 px: no radius, 20 px padding", () => {
    const at = stripped.indexOf("@media (width < 600px)");
    expect(at).toBeGreaterThan(-1);
    const block = stripped.slice(at);
    expect(block).toMatch(/\.k-dialog[^{]*\{[^}]*border-radius:\s*0/);
    expect(block).toMatch(/\.k-dialog[^{]*\{[^}]*padding:\s*var\(--s-20\)/);
  });
});
