// src/ui/Toast.tsx
import { Toast as KitToast, type ToastProps as KitToastProps } from "../kit/Toast";

export { TOAST_MS } from "../kit/Toast";

export type ToastProps = Omit<KitToastProps, "icon" | "legacy">;

/**
 * The old note, now the kit's `Toast` in its legacy look (fixed at the foot of the page), so the
 * screens not rebuilt yet keep working. Same timing and live region. UI rebuild Task 17 deletes
 * this file.
 */
export function Toast(props: ToastProps) {
  return <KitToast {...props} legacy />;
}
