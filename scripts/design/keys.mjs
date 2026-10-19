// scripts/design/keys.mjs
// The keyboard probe of the Settings drawer (`settings-keys`, `m-settings-keys`): what the page
// did with Tab, Shift+Tab and Escape, said as problems. shots.mjs presses the keys in Chromium and
// reads where the focus went; `trapProblems` judges it. Pure, so it is tested without a browser.
//
// A native modal <dialog> does not wrap the focus inside the page: Tab past its last control goes
// to the browser's own interface (the address bar; in a headless run, nothing: the body), and the
// next Tab comes back to its first control. That is the platform's behaviour and it keeps the
// page behind out of reach, so the probe accepts one such step through the browser ("viaBrowser")
// and fails only a focus that lands on the page behind the drawer.

/**
 * What a focus trap must do. `report`:
 *   stops             the drawer's controls in the order Tab reached them from the drawer's heading
 *                     until one came round again, each `{ label }`
 *   behind            labels of anything else the focus landed on in the page (outside the drawer)
 *   wrapTo            the label of the control that came round again, or null when none did in the limit
 *   viaBrowser        the focus went through the browser's own interface between the last control and wrapTo
 *   shiftTabFromFirst the label of the control Shift+Tab reached from the first one
 *   shiftViaBrowser   the same, through the browser's interface
 */
export function trapProblems({
  stops,
  behind,
  wrapTo,
  viaBrowser,
  shiftTabFromFirst,
  shiftViaBrowser,
}) {
  if (stops.length < 2) {
    return [`the drawer has ${stops.length} Tab stops: nothing to trap`];
  }
  const problems = [];
  if (behind.length > 0) {
    problems.push(`Tab took the focus to the page behind the drawer: ${behind.join(", ")}`);
  }
  const first = stops[0].label;
  const last = stops.at(-1).label;
  const how = (via) => (via ? " (through the browser's own interface)" : "");
  if (wrapTo === null) {
    problems.push(`Tab never came round to the first control within ${stops.length} stops`);
  } else if (wrapTo !== first) {
    problems.push(
      `Tab past the last control (${last}) went to ${wrapTo}${how(viaBrowser)}, not the first (${first})`,
    );
  }
  if (shiftTabFromFirst !== last) {
    problems.push(
      `Shift+Tab from the first control (${first}) went to ${shiftTabFromFirst}${how(shiftViaBrowser)}, not the last (${last})`,
    );
  }
  return problems;
}
