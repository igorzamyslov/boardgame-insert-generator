/**
 * realizeTray could give some card, tile, minis or custom compartments no wall cutout on either
 * axis: a well too small for a cut of MIN_CUT_MM (or fingerPocket.width, if smaller) with POST_MM
 * posts, or with no free wall (roadmap §4.7). Whether a part has its cuts depends on its compartments
 * and their order only, so size() checks every variant part once per option at its minOuter and
 * leaves out the variants that throw this, with a `sizing.noFingerSlot` warning when none is left:
 * every part size() returns realizes at every outer and option. Sizing-internal (not exported).
 */
export class CutFitError extends RangeError {
  /** The narrowest cut allowed, mm. */
  readonly minWidth: number;
  /** The components and contents labels of the compartments left without a cut. */
  readonly componentIds: readonly string[];
  readonly contents: readonly string[];

  constructor(
    message: string,
    minWidth: number,
    componentIds: readonly string[],
    contents: readonly string[],
  ) {
    super(message);
    this.name = "CutFitError";
    this.minWidth = minWidth;
    this.componentIds = componentIds;
    this.contents = contents;
  }
}
