// src/ui/BottomSheet.tsx
import { Sheet, type SheetProps } from "../kit/Sheet";

export type BottomSheetProps = Omit<SheetProps, "legacy" | "peek">;

/**
 * The old phone sheet, now the kit's `Sheet` in its legacy look (the `.pf-sheet` classes of
 * style.css), so the screens not rebuilt yet keep working. Its focus, Escape and inert behaviour
 * are the kit's. UI rebuild Task 17 deletes this file.
 */
export function BottomSheet(props: BottomSheetProps) {
  return <Sheet {...props} legacy />;
}
