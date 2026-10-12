// @vitest-environment node
import { SWEEP_FIXTURES } from "./test-specs";
import { sweepCoverage, sweepMeshes } from "./test-sweep";

// The mesh sweep of the card and bits fixtures (tray.sizing-tiles.test.ts builds the tile ones),
// and what the whole sweep covers.
sweepMeshes(SWEEP_FIXTURES.filter(([name]) => !name.includes("tiles")));
sweepCoverage();
