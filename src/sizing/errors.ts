/**
 * realizeTray could not fit a finger slot of at least min(MIN_SLOT_WIDTH, fingerPocket.width) for
 * some compartments (roadmap §4.7). Not a programming error: layout treats the part as infeasible
 * at those options, and size() drops variants that fail at minOuter. A RangeError of its own name,
 * so callers tell it apart from an outer below minOuter or a broken invariant.
 */
export class SlotFitError extends RangeError {
  /** The narrowest slot allowed, mm: min(MIN_SLOT_WIDTH, fingerPocket.width). */
  readonly minWidth: number;
  /** The components and contents labels of the compartments whose slots did not fit. */
  readonly componentIds: readonly string[];
  readonly contents: readonly string[];

  constructor(
    message: string,
    minWidth: number,
    componentIds: readonly string[],
    contents: readonly string[],
  ) {
    super(message);
    this.name = "SlotFitError";
    this.minWidth = minWidth;
    this.componentIds = componentIds;
    this.contents = contents;
  }
}
