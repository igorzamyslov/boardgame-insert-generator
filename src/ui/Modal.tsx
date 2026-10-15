// src/ui/Modal.tsx
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

export interface ModalProps {
  /** The id of the heading inside `children` that names the dialog. */
  labelledBy: string;
  /** Escape or the Close button: the owner unmounts the modal, which ends it. */
  onClose: () => void;
  children: ComponentChildren;
}

/**
 * A modal dialog over the current view: a native <dialog> opened with showModal(), so the browser
 * itself keeps the focus inside it, makes everything behind it inert (to clicks, to the keyboard
 * and to assistive technology) and puts it above the page. The owner mounts it to open and
 * unmounts it to close. Escape asks to close (`cancel`) and the owner decides; on close the
 * focus goes back to what had it when the dialog opened (the button that opened it).
 *
 * The first focus is whatever inside carries `autofocus`, else the dialog's first focusable
 * element. Where `showModal` is missing (jsdom, very old browsers) the dialog is simply shown
 * open, without the trap.
 */
export function Modal({ labelledBy, onClose, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // A layout effect, so it runs before the children's effects: their focus() calls (a heading to
  // start at, say) need the dialog already open.
  useLayoutEffect(() => {
    const el = dialog.current;
    if (!el) {
      return undefined;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof el.showModal === "function") {
      el.showModal();
    } else {
      el.setAttribute("open", "");
    }
    return () => {
      if (typeof el.close === "function" && el.open) {
        el.close();
      }
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      class="modal"
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        // Not the browser's own close: the state decides, so the two never disagree.
        e.preventDefault();
        onCloseRef.current();
      }}
    >
      <div class="modal-body">{children}</div>
      <div class="modal-actions">
        <button type="button" onClick={() => onCloseRef.current()}>
          Close
        </button>
      </div>
    </dialog>
  );
}
