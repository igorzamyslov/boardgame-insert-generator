// scripts/design/renderBoard.d.mts
export interface BoardOptions {
  /** Overlays the defaults of the board's `data-props`. */
  props?: Record<string, unknown>;
  /** The board's `this.state` (null at first paint). */
  state?: Record<string, unknown>;
}

/** The directory of the board files, with a trailing slash. */
export const BOARDS_DIR: string;

/** The board as a full HTML document: template expanded, handlers stripped, local fonts. */
export function renderBoard(file: string, opts?: BoardOptions): Promise<string>;

/** The size the board is drawn at (its `$preview`). */
export function boardPreview(file: string): { width: number; height: number };

/** The fixed text of a board's source: template text nodes and script string literals, as written. */
export function boardTexts(file: string): { markup: string[]; strings: string[] };
