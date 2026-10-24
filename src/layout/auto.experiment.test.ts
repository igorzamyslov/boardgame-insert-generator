/**
 * How Auto (settings.lip.joint "auto") does against each joint alone, on the seed projects and any
 * project files named in AUTO_FILES (colon separated). Skipped in normal runs; from the repo root:
 *   AUTO_EXPERIMENT=1 npx vitest run src/layout/auto.experiment.test.ts --reporter=verbose
 * It prints one line per project and seed: whether the rim and groove, the stepped base and Auto
 * fit, and the joint Auto chose, into the file named in AUTO_OUT. Files are only read.
 */
import { expect, it } from "vitest";
import { buildLayoutInput } from "../app/runner";
import { withJoint } from "../model/lip";
import { parseProject } from "../model/schema";
import type { LipJoint, Project } from "../model/types";
import { DEFAULT_ITERATIONS, createRun } from "./optimize";
import type { LayoutResult } from "./types";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
/** The seed projects: browser-storage dumps, each with its project's JSON as a string. */
const SEEDS = import.meta.glob<{ storage: Record<string, string> }>(
  "../../docs/design/seeds/*.json",
  { eager: true, import: "default" },
);
const SKIPPED = /\.result\.json$/;
const ITERATIONS = Number(env?.AUTO_ITERATIONS ?? DEFAULT_ITERATIONS);

interface Fs {
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: string): void;
}

/** The named files, parsed: a project file, or a storage dump like the seeds. */
async function sources(): Promise<[string, unknown][]> {
  const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as unknown as Fs;
  const out: [string, unknown][] = Object.entries(SEEDS)
    .filter(([name]) => !SKIPPED.test(name))
    .flatMap(([name, dump]) =>
      Object.entries(dump.storage)
        .filter(([key]) => key.startsWith("insert-generator:project:"))
        .map(([, json]): [string, unknown] => [name.split("/").pop() ?? name, JSON.parse(json)]),
    );
  for (const file of (env?.AUTO_FILES ?? "").split(":").filter((f) => f !== "")) {
    out.push([file.split("/").pop() ?? file, JSON.parse(fs.readFileSync(file, "utf8"))]);
  }
  return out;
}

function run(p: Project, joint: LipJoint, seed: number): LayoutResult {
  const q = { ...p, settings: withJoint(p.settings, joint) };
  const input = buildLayoutInput(q);
  // no time cap: the machine's load must not decide which search finishes
  const r = createRun(input, seed, ITERATIONS, { timeCapMs: 3_600_000 });
  while (!r.step()) {
    // runs to the end of its budget
  }
  return r.result();
}

it.skipIf(env?.AUTO_EXPERIMENT !== "1")(
  "compares Auto with each joint",
  async () => {
    const lines: string[] = [];
    const tally = {
      auto: { rim: 0, step: 0, none: 0 },
      fitsOnlyAuto: 0,
      fitsOnlyOld: 0,
      autoMissed: 0,
      onlyStep: 0,
      runs: 0,
    };
    for (const [file, raw] of await sources()) {
      const parsed = parseProject(raw);
      if (!parsed.ok) {
        lines.push(`${file}: not read`);
        continue;
      }
      const p = parsed.project;
      if (p.components.length === 0) {
        continue;
      }
      for (const seed of [1, 2, 3]) {
        const rim = run(p, "rim", seed);
        const step = run(p, "step", seed);
        const auto = run(p, "auto", seed);
        const fit = (r: LayoutResult) =>
          r.layout !== null ? `fits ${r.summary?.fillPct.toFixed(1)}%` : "no fit";
        const joint = auto.layout?.joint ?? auto.bestAttempt?.joint ?? "-";
        tally.runs += 1;
        if (auto.layout === null) {
          tally.auto.none += 1;
        } else if (joint === "rim" || joint === "step") {
          tally.auto[joint] += 1;
        }
        if (auto.layout !== null && rim.layout === null) {
          tally.fitsOnlyAuto += 1;
        }
        if (auto.layout === null && (rim.layout !== null || step.layout !== null)) {
          tally.autoMissed += 1;
        }
        if (rim.layout === null && step.layout !== null) {
          tally.onlyStep += 1;
        }
        if (auto.layout === null && rim.layout !== null) {
          tally.fitsOnlyOld += 1;
        }
        lines.push(
          `${file} seed ${seed}: rim ${fit(rim)}, step ${fit(step)}, auto ${fit(auto)} → ${joint}`,
        );
      }
    }
    const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as unknown as Fs;
    fs.writeFileSync(
      env?.AUTO_OUT ?? "auto-experiment.txt",
      `${lines.join("\n")}\n${JSON.stringify(tally)}\n`,
    );
    expect(tally.runs).toBeGreaterThan(0);
  },
  3_600_000,
);
