// scripts/smoke-dist.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./smoke-dist.mjs", import.meta.url));
const created = [];

function makeDist(files) {
  const dir = mkdtempSync(join(tmpdir(), "smoke-dist-"));
  created.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
}

function goodFiles() {
  return {
    "index.html":
      '<!doctype html><html><head><script type="module" crossorigin src="./assets/index-abc.js"></script><link rel="stylesheet" crossorigin href="./assets/index-abc.css"></head><body><div id="app"></div></body></html>',
    "assets/index-abc.js":
      'new Worker(new URL("worker-l1.js", import.meta.url), { type: "module" }); import("./client-x.js");',
    "assets/client-x.js":
      'new Worker(new URL("worker-g2.js", import.meta.url), { type: "module" });',
    "assets/worker-l1.js": "self.onmessage = () => {};",
    "assets/worker-g2.js": 'fetch(new URL("manifold-m3.wasm", import.meta.url));',
    "assets/manifold-m3.wasm": "\u0000asm",
    "assets/index-abc.css": "body { margin: 0; }",
    "third-party-licenses.txt": "manifold-3d Clipper2 three preact @preact/signals fflate",
  };
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("smoke-dist", () => {
  it("passes a dist with relative assets, workers, wasm and licenses", () => {
    const result = run(makeDist(goodFiles()));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/smoke-dist: OK/);
  });

  it("fails on an absolute asset path in index.html", () => {
    const files = goodFiles();
    files["index.html"] = files["index.html"].replace(
      "./assets/index-abc.js",
      "/assets/index-abc.js",
    );
    const result = run(makeDist(files));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/absolute/);
  });

  it("fails on an absolute /assets/ reference inside a script", () => {
    const files = goodFiles();
    files["assets/client-x.js"] = 'new Worker("/assets/worker-g2.js");';
    const result = run(makeDist(files));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/absolute \/assets\//);
  });

  it("fails without wasm or with an unreferenced worker", () => {
    const noWasm = goodFiles();
    delete noWasm["assets/manifold-m3.wasm"];
    expect(run(makeDist(noWasm)).stderr).toMatch(/no \.wasm/);
    const orphan = goodFiles();
    orphan["assets/client-x.js"] = "export {};";
    expect(run(makeDist(orphan)).stderr).toMatch(/worker-g2\.js is not referenced/);
  });

  it("fails when the licenses file misses a package", () => {
    const files = goodFiles();
    files["third-party-licenses.txt"] = "three preact";
    const result = run(makeDist(files));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/manifold-3d/);
  });
});
