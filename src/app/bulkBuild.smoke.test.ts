// src/app/bulkBuild.smoke.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildTray, loadManifold } from "../geometry";
import { BUILD_TIMEOUT_MS } from "../geometry/client";
import { optimize } from "../layout";
import { FIXTURES, fixtureInput, type FixtureName } from "../layout/test-fixtures";
import { MAX_IN_FLIGHT } from "./meshes";

describe("bulk build smoke", () => {
  it(
    "builds every part of the fixture layouts well inside BUILD_TIMEOUT_MS",
    { timeout: 120_000 },
    async () => {
      const m = await loadManifold();
      const names = Object.keys(FIXTURES) as FixtureName[];
      const layouts = names.map((name) => {
        const input = fixtureInput(name);
        return { name, settings: input.settings, layout: optimize(input, 1, 2000).layout };
      });
      // Every fixture but tiny-box (infeasible by design, roadmap §5) has a layout to build.
      expect(layouts.filter((l) => l.layout === null).map((l) => l.name)).toEqual(["tiny-box"]);
      const builds = layouts.flatMap(({ settings, layout }) =>
        (layout?.trays ?? []).map((spec) => ({ spec, settings })),
      );
      // At least one part per feasible fixture.
      expect(builds.length).toBeGreaterThanOrEqual(names.length - 1);
      let slowest = 0;
      for (const { spec, settings } of builds) {
        const start = performance.now();
        buildTray(m, spec, settings);
        slowest = Math.max(slowest, performance.now() - start);
      }
      expect(slowest * MAX_IN_FLIGHT * 5, `slowest build ${slowest.toFixed(0)} ms`).toBeLessThan(
        BUILD_TIMEOUT_MS,
      );
    },
  );
});
