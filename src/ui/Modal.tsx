// src/ui/Modal.tsx
import { Dialog, type DialogProps } from "../kit/Dialog";

export type ModalProps = Omit<DialogProps, "placement" | "legacy">;

/**
 * The old dialog, now the kit's `Dialog` in its legacy look (the `.modal` classes and a Close row
 * at the foot), so the screens not rebuilt yet keep working. Its focus, Escape and inert
 * behaviour are the kit's. UI rebuild Task 17 deletes this file.
 */
export function Modal(props: ModalProps) {
  return <Dialog {...props} legacy />;
}
