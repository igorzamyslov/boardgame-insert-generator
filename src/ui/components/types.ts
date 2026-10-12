// src/ui/components/types.ts
import type { Component } from "../../model/types";

export interface EditorProps<C extends Component> {
  component: C;
  index: number;
  advanced: boolean;
  onChange: (next: C) => void;
}
