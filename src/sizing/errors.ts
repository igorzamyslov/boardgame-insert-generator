/**
 * realizeTray could not give some compartments their finger access (roadmap §4.7): a finger slot
 * of at least min(MIN_SLOT_WIDTH, fingerPocket.width) for minis pockets and custom wells
 * (`what` "slot"), or a wall cutout on either axis for cards and tiles ("cutout": a well too small
 * for a cut of MIN_CUT_MM with POST_MM posts). Not a programming error: layout treats
 * the part as infeasible at those options, and size() drops variants that fail at minOuter. A
 * RangeError of its own name, so callers tell it apart from an outer below minOuter or a broken
 * invariant.
 */
export class SlotFitError extends RangeError {
  readonly what: "slot" | "cutout";
  /** The narrowest slot or cut allowed, mm: min(MIN_SLOT_WIDTH or MIN_CUT_MM, fingerPocket.width). */
  readonly minWidth: number;
  /** The components and contents labels of the compartments left without finger access. */
  readonly componentIds: readonly string[];
  readonly contents: readonly string[];

  constructor(
    message: string,
    what: "slot" | "cutout",
    minWidth: number,
    componentIds: readonly string[],
    contents: readonly string[],
  ) {
    super(message);
    this.name = "SlotFitError";
    this.what = what;
    this.minWidth = minWidth;
    this.componentIds = componentIds;
    this.contents = contents;
  }
}
