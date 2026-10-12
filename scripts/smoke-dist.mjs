#!/usr/bin/env node
// scripts/smoke-dist.mjs — build smoke test (spec §11 "Build").
//
//   node scripts/smoke-dist.mjs [distDir]
//
// Serves dist/ from the deploy subpath, the way GitHub Pages does
// (/static-web-apps/insert-generator/), and checks that index.html only uses
// relative asset URLs that load, that the layout and geometry workers and the
// manifold WASM exist and are referenced by name, that every script (lazy chunks included)
// loads and every chunk a script imports exists, that no file points at an
// absolute /assets/ path, and that the third-party licenses file is complete.
//
// Limits: no browser runs the page. This proves the files are there and wired
// relatively; it does not prove that the workers or the WASM execute. That takes the check in a
// real browser that the README describes ("Build smoke test and its limits").
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, posix, relative, resolve, sep } from "node:path";
import process from "node:process";

const BASE = "/static-web-apps/insert-generator/";
// Keep in step with REQUIRED_PACKAGES in src/licenses/renderLicenses.ts, the source of truth
// (this plain Node script cannot import that TypeScript module).
const REQUIRED_LICENSES = [
  "manifold-3d",
  "Clipper2",
  "three",
  "preact",
  "@preact/signals",
  "fflate",
];
// A relative static or dynamic import of a script: from"./x.js", import("./x.js"), import "./x.js".
const IMPORT_PATH = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+\.js)["']/g;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const root = resolve(process.argv[2] ?? "dist");
const problems = [];

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(path)));
    } else {
      out.push(relative(root, path).split(sep).join("/"));
    }
  }
  return out;
}

function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const rel = decodeURIComponent(url.pathname.slice(BASE.length)) || "index.html";
    const file = resolve(root, rel);
    if (!file.startsWith(`${root}${sep}`)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

async function check() {
  let files;
  try {
    files = await listFiles(root);
  } catch {
    problems.push(`${root} does not exist or is not readable`);
    return;
  }
  if (!files.includes("index.html")) {
    problems.push("index.html is missing");
    return;
  }
  const server = await startServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const page = new URL(`http://127.0.0.1:${port}${BASE}`);
  try {
    const html = await readFile(join(root, "index.html"), "utf8");
    const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    if (refs.length === 0) {
      problems.push("index.html references no assets");
    }
    for (const ref of refs) {
      if (/^(?:\/|[a-z][a-z0-9+.-]*:)/i.test(ref)) {
        problems.push(`index.html uses an absolute URL: ${ref}`);
        continue;
      }
      const res = await fetch(new URL(ref, page));
      if (res.status !== 200) {
        problems.push(`${ref} (from index.html) returned ${res.status} under ${BASE}`);
      }
    }

    const texts = new Map();
    for (const f of files.filter((name) => /\.(?:js|css|html)$/.test(name))) {
      texts.set(f, await readFile(join(root, f), "utf8"));
    }
    for (const [name, text] of texts) {
      if (/["'(`]\/assets\//.test(text)) {
        problems.push(`${name} contains an absolute /assets/ reference`);
      }
    }

    const scripts = [...texts].filter(([name]) => name.endsWith(".js"));
    const base = (path) => path.split("/").at(-1) ?? path;
    const wasm = files.filter((f) => f.endsWith(".wasm"));
    const workers = files.filter((f) => f.endsWith(".js") && /worker/i.test(base(f)));
    if (wasm.length === 0) {
      problems.push("no .wasm file in dist (manifold-3d)");
    }
    if (workers.length < 2) {
      problems.push(`expected the layout and geometry worker scripts, found ${workers.length}`);
    }
    for (const f of [...wasm, ...workers]) {
      const name = base(f);
      if (!scripts.some(([other, text]) => other !== f && text.includes(name))) {
        problems.push(`${name} is not referenced by any script`);
      }
      const res = await fetch(new URL(f, page));
      if (res.status !== 200) {
        problems.push(`${f} returned ${res.status} under ${BASE}`);
      } else if (f.endsWith(".wasm") && res.headers.get("content-type") !== "application/wasm") {
        problems.push(`${f} is not served as application/wasm`);
      }
    }

    // Lazy chunks (the 3D view's scene, the clients): every script must load as JavaScript,
    // and every chunk one script imports by relative path must exist in dist.
    for (const [name] of scripts) {
      const res = await fetch(new URL(name, page));
      const type = res.headers.get("content-type") ?? "";
      if (res.status !== 200) {
        problems.push(`${name} returned ${res.status} under ${BASE}`);
      } else if (!/javascript/.test(type)) {
        problems.push(`${name} is not served as JavaScript (${type})`);
      }
    }
    for (const [name, text] of scripts) {
      const dir = posix.dirname(name);
      for (const m of text.matchAll(IMPORT_PATH)) {
        const target = posix.normalize(posix.join(dir, m[1]));
        if (!files.includes(target)) {
          problems.push(`${target} is missing (imported by ${name})`);
        }
      }
    }

    if (!files.includes("third-party-licenses.txt")) {
      problems.push("third-party-licenses.txt is missing");
    } else {
      const licenses = await readFile(join(root, "third-party-licenses.txt"), "utf8");
      for (const name of REQUIRED_LICENSES) {
        if (!licenses.includes(name)) {
          problems.push(`third-party-licenses.txt does not mention ${name}`);
        }
      }
    }
  } finally {
    server.close();
  }
}

await check();
if (problems.length > 0) {
  process.stderr.write(`smoke-dist: FAILED\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`smoke-dist: OK (${root} served from ${BASE})\n`);
