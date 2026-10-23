// src/screens/stageView.ts
// The stage's View selection ("Top" or "3D", the status row's segment), for the plan and the 3D
// frame beside it (Task 7). The Layer selection is `state.viewLayer`. Like `hoveredComponent`, a
// module signal the app resets when it goes.
import { signal } from "@preact/signals";
import type { StageView } from "./StageTop";

export const stageView = signal<StageView>("plan");
