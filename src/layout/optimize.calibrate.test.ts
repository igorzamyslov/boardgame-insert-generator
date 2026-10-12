/**
 * Calibration for DEFAULT_ITERATIONS (spec §7.2: the default budget runs ≈ 3 s on a
 * mid-range laptop). Skipped in normal runs. On such a machine, from the repo root:
 *   CALIBRATE=1 npx vitest run src/layout/optimize.calibrate.test.ts --reporter=verbose
 * It prints iterations/s per fixture and the suggested constant:
 * 3 × (iterations/s of the slowest fixture), rounded down to a multiple of 1000.
 * Update DEFAULT_ITERATIONS in optimize.ts (and the measurement comment there) with it.
 */
import { expect, it } from "vitest";
import { fixtureInput, type FixtureName } from "./test-fixtures";
import { optimize } from "./optimize";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const RUN_ITERATIONS = 10_000;
const NAMES: FixtureName[] = [
  "cards-heavy",
  "bits-heavy",
  "tiles-minis",
  "small-tiles",
  "tiny-box",
];

it.skipIf(env?.CALIBRATE !== "1")("measures iterations per second on the fixtures", () => {
  const rates = NAMES.map((name) => {
    const input = fixtureInput(name);
    optimize(input, 1, 1000);
    const t0 = performance.now();
    optimize(input, 1, RUN_ITERATIONS);
    const seconds = (performance.now() - t0) / 1000;
    return { name, perSecond: Math.round(RUN_ITERATIONS / seconds) };
  });
  const slowest = Math.min(...rates.map((r) => r.perSecond));
  const suggested = Math.floor((3 * slowest) / 1000) * 1000;
  console.warn(JSON.stringify({ rates, suggestedDefaultIterations: suggested }, null, 2));
  expect(slowest).toBeGreaterThan(0);
});
