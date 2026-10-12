// src/ui/components/ListNotices.tsx
import { FieldMessages, messagesOf } from "../FieldMessages";
import { useFieldNotices } from "../validation";

/** The notices of a whole list (such as "Add at least one deck."), shown under its legend. */
export function ListNotices({ id, path }: { id: string; path: string }) {
  const { errors, notes } = messagesOf(useFieldNotices(path));
  return <FieldMessages id={id} errors={errors} notes={notes} />;
}
