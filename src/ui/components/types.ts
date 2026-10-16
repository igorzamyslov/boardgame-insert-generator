// src/ui/components/types.ts
import type { Component } from "../../model/types";

export interface EditorProps<C extends Component> {
  component: C;
  index: number;
  /** Ignored: every editor shows all its fields. Removed with the last caller. */
  advanced?: boolean;
  onChange: (next: C) => void;
}
