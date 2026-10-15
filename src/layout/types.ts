import type { Box, Printer, Settings, Lock, StoredLayout, TraySpec, Notice } from "../model/types";
import type { TrayRequirement } from "../sizing/types";

export interface LayoutInput {
  requirements: TrayRequirement[];
  box: Box;
  printer: Printer;
  settings: Settings;
  locks: Lock[];
  inputsHash: string;
  appVersion: string;
}

export interface LayoutSummary {
  fillPct: number; // tray volume (outer) / usable box volume × 100
  trayCount: number; // printed parts excluding spacers
  stackCount: number;
  fillerCount: number; // filler parts to place by hand, after merging (settings.mergeFillers / mergeRisers); a stack level's fillers included
  mergeFillers: boolean; // the merge switches this summary was made under: it stands for these only
  mergeRisers: boolean;
  filamentG: number; // upper bound over the printed parts (risers split out): solid volume × 1.24 g/cm³
  filamentAtInfillG: number; // shell-and-core estimate at settings.infill (see summarize.ts)
  infillPct: number; // the settings.infill the estimate used
  printMinutes: number; // rough print time for the whole set, from the filament estimate's volume (see summarize.ts)
  longestPartMinutes: number; // the same for the one part that takes longest, for planning a batch
  playLimit: number; // the settings.playLimit (mm) the summary and its warnings were made under
  playX: number; // nominal lateral play, mm
  playY: number;
  crossX: number; // most trays side by side in a row across X: what playX is made of
  crossY: number; // most trays one behind the other along Y, for playY
}

export interface LayoutResult {
  layout: StoredLayout | null; // best feasible; null if none
  bestAttempt: { trays: TraySpec[]; shortfall: { x: number; y: number; z: number } } | null;
  summary: LayoutSummary | null;
  notices: Notice[]; // warnings (coverage, play, lip off, capped, bed, doesNotFit) + dropped locks
}

export type LayoutRequest =
  | {
      type: "run";
      runId: number;
      input: LayoutInput;
      seed: number;
      iterations: number; // this run's budget (roadmap §4.8)
      warmStart?: StoredLayout;
    }
  | { type: "cancel"; runId: number };

export type LayoutResponse =
  | { type: "progress"; runId: number; done: number; total: number; best: LayoutResult }
  | { type: "done"; runId: number; result: LayoutResult }
  | { type: "error"; runId: number; message: string };
