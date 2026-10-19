// scripts/design/consoleErrors.mjs
// The harness records what the page logs as an error while a state is shot (`console.error` and
// uncaught page errors). A state may list messages it expects (`expectedErrors`: a string that
// the message contains, or a RegExp); any other error fails the state. Pure helpers; shots.mjs
// does the listening.

/** Does `message` match one allowlist entry (a substring, or a RegExp)? */
const matches = (message, allowed) =>
  allowed instanceof RegExp ? allowed.test(message) : message.includes(allowed);

/** Splits what the page logged into the errors the state expects and the ones it does not. */
export function splitErrors(errors, allowed = []) {
  const expected = [];
  const unexpected = [];
  for (const message of errors) {
    (allowed.some((a) => matches(message, a)) ? expected : unexpected).push(message);
  }
  return { expected, unexpected };
}

const oneLine = (message) => message.replaceAll(/\s+/g, " ").trim();

/** The "Console errors" section of a state's numbers file: "none" when the page logged no error. */
export function consoleSection(errors, allowed = []) {
  if (errors.length === 0) {
    return "## Console errors\n\nnone\n";
  }
  const { expected, unexpected } = splitErrors(errors, allowed);
  const lines = [
    ...unexpected.map((m) => `- ${oneLine(m)}`),
    ...expected.map((m) => `- ${oneLine(m)} (expected)`),
  ];
  return `## Console errors\n\n${lines.join("\n")}\n`;
}

/**
 * The summary line at the end of a run: the states with unexpected errors and how many each, or
 * that there were none. `byState` maps a state's name to `{ errors, allowed }`.
 */
export function consoleSummary(byState) {
  const withErrors = [];
  for (const [name, { errors, allowed }] of Object.entries(byState)) {
    const { unexpected } = splitErrors(errors, allowed);
    if (unexpected.length > 0) {
      withErrors.push(`${name} (${unexpected.length})`);
    }
  }
  return withErrors.length === 0
    ? "console errors: none"
    : `console errors in ${withErrors.length} state${withErrors.length === 1 ? "" : "s"}: ${withErrors.join(", ")}`;
}
