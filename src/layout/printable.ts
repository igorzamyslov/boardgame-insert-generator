import type { Component, Lock, Notice, Printer, Settings, TraySpec } from "../model/types";
import { splitDividers } from "./dividers";
import { addTopChamfers } from "./chamfers";
import { mergeParts } from "./merge";
import { splitRisers } from "./risers";
import { splitSeparators } from "./separators";
import { openSpacers } from "./spacers";

/** What printableParts reads from a project. */
export interface PrintableInputs {
  components: readonly Component[];
  settings: Settings;
  printer: Printer;
  locks: readonly Lock[];
}

/**
 * The parts to print for a stored layout: the stored trays with the height a stack doesn't need
 * split off as a riser under it (spec §3 rule 2), each stretch spacer split into its component's
 * plates (spec §6.2), a divider for each slot in a tray's floor (minimal-trays spec §5), each spacer or plate opened into a walled box where the `leftover` style and
 * its size allow, and last the connected fillers (and, with `mergeRisers`, the risers) merged into
 * the largest parts that fit the bed. Then a top chamfer is cut along each solid filler's edge where it touches
 * a tray, so the tray beside it can be gripped (`addTopChamfers`, on the parts' own `features`). All
 * of it derived: none of it is stored, so the stored layout and a share link are the same however
 * it is split.
 */
export function printableParts(
  trays: readonly TraySpec[],
  o: PrintableInputs,
): { trays: TraySpec[]; notices: Notice[] } {
  const risered = splitRisers(trays, o);
  const split = splitSeparators(risered, o);
  const opened = openSpacers(splitDividers(split.trays, o.settings), o);
  return { trays: addTopChamfers(mergeParts(opened, o), o), notices: split.notices };
}
