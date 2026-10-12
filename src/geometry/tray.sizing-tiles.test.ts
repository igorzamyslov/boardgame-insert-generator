// @vitest-environment node
import { SWEEP_FIXTURES } from "./test-specs";
import { sweepMeshes } from "./test-sweep";

// The mesh sweep of the tile fixtures (tray.sizing.test.ts builds the others).
sweepMeshes(SWEEP_FIXTURES.filter(([name]) => name.includes("tiles")));
