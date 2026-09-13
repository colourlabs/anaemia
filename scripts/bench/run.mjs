// usage (from repo root or anywhere):
//   node scripts/bench/run.mjs                    # build + run 15s @ 50 workers
//   node scripts/bench/run.mjs --duration=30 --concurrency=100
//   node scripts/bench/run.mjs --profile          # also emit V8 cpu/heap profiles
//   node scripts/bench/run.mjs --no-build         # reuse existing .anaemia build
//   node scripts/bench/run.mjs --runner=oha       # delegate load to oha/autocannon
//
// the bench app under ./app resolves @anaemia/core to the monorepo's own dist
// (the bundler aliases it in packages/bundler/src/index.ts), so this measures
// the CURRENT framework source. The app has no node_modules of its own.

import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const appDir = path.join(__dirname, "app");
const serverFile = path.join(appDir, ".anaemia", "server", "index.js");
const cliEntry = path.join(repoRoot, "packages", "cli", "dist", "index.js");

function parseArgs(argv) {
  const flags = {};
  for (const raw of argv) {
    const [key, value = true] = raw.split("=");
    flags[key] = value === "true" ? true : value === "false" ? false : value;
  }
  return flags;
}
const args = parseArgs(process.argv.slice(2));

const port = Number(args["--port"] ?? 3001);
const concurrency = Number(args["--concurrency"] ?? 50);
const durationSec = Number(args["--duration"] ?? 15);
const doBuild = args["--build"] !== false && !args["--no-build"];
const profile = Boolean(args["--profile"]);
const runner = String(args["--runner"] ?? "node");
const outFile = args["--out"] ? path.resolve(args["--out"]) : null;

// route mix weights (sum 100); /_rpc reuses one page token, see rpcPage()
const MIX = [
  { url: "/", weight: 40 },
  { url: "/dynamic", weight: 40 },
  { url: "/_rpc", weight: 20 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runProcess(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv.join(" ")} exited ${code}`))));
  });
}

function resolvePkgFromStore(pkgName) {
  const pnpmModules = path.join(repoRoot, "node_modules", ".pnpm");
  for (const entry of fs.readdirSync(pnpmModules)) {
    const encoded = pkgName.replace("/", "+");
    if (entry.startsWith(`${encoded}@`)) {
      return path.join(pnpmModules, entry, "node_modules", pkgName);
    }
  }
  throw new Error(`cannot find ${pkgName} in .pnpm store — run \`pnpm install\` in the repo root first`);
}

function ensureLocalDeps() {
  const nm = path.join(appDir, "node_modules");
  const links = [
    ["solid-js", resolvePkgFromStore("solid-js")],
    ["@solidjs/router", resolvePkgFromStore("@solidjs/router")],
    // the bundler aliases @anaemia/core to the monorepo dist for the server
    // build, but the CLIENT compiler resolves it from the app root — point it
    // at the current source so the whole bench measures this codebase.
    ["@anaemia/core", path.join(repoRoot, "packages", "core")],
  ];
  for (const [pkg, source] of links) {
    const target = path.join(nm, pkg);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(path.relative(path.dirname(target), source), target);
  }
}

async function buildApp() {
  if (!fs.existsSync(cliEntry)) {
    throw new Error("CLI not built - run `pnpm build` in the repo first");
  }
  await runProcess(process.execPath, [cliEntry, "build"], { cwd: appDir, env: { ...process.env, NODE_ENV: "production" } });
}

let server;
let serverStopped = false;
function startServer() {
  if (!fs.existsSync(serverFile)) throw new Error(`missing ${serverFile} — build the bench app first`);
  const env = { ...process.env, NODE_ENV: "production", PORT: String(port) };
  if (profile) {
    const profDir = path.join(__dirname, "profiles");
    fs.mkdirSync(profDir, { recursive: true });
    env.NODE_OPTIONS = `--cpu-prof --cpu-prof-dir=${profDir} --heap-prof --heap-prof-dir=${profDir}`;
  }
  const child = spawn(process.execPath, [serverFile], { cwd: appDir, env, stdio: profile ? "inherit" : "ignore" });
  child.on("exit", (code) => {
    if (!serverStopped) console.error(`[bench] server exited early (code ${code})`);
  });
  return child;
}

async function waitReady(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(150);
  }
  throw new Error(`server did not become ready on port ${port}`);
}

// the server registers RPC functions when their route module is evaluated, and
// route modules are code-split into lazily-loaded server chunks. fetching the
// /rpc page renders it server-side (evaluating the chunk and registering the
// bench-echo function) and returns a fresh page token - both in one request.
// pulling the token from a page that doesn't declare the function would leave
// it unregistered and every /_rpc call would fail with 404.
async function fetchRpcToken() {
  const res = await fetch(`http://127.0.0.1:${port}/rpc`);
  const html = await res.text();
  const match = html.match(/__RPC_TOKEN__":"([^"]+)"/);
  if (!match) throw new Error("could not extract RPC token from /rpc page");
  return match[1];
}

function request(path, { method = "GET", headers = {}, body, agent } = {}) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const req = http.request({ host: "127.0.0.1", port, path, method, headers, agent }, (res) => {
      res.resume();
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, ms: Number(process.hrtime.bigint() - started) / 1e6 });
      });
    });
    req.on("error", () => {
      resolve({ status: 0, ms: Number(process.hrtime.bigint() - started) / 1e6 });
    });
    if (body) req.write(body);
    req.end();
  });
}

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return sorted[idx];
}

function pickRoute() {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const route of MIX) {
    acc += route.weight;
    if (roll < acc) return route;
  }
  return MIX[0];
}

async function runNodeLoad(token) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const deadline = Date.now() + durationSec * 1000;
  const latencies = [];
  const byRoute = new Map(MIX.map((r) => [r.url, { requests: 0, errors: 0 }]));
  let totalErrors = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, 32) }, async () => {
      while (Date.now() < deadline) {
        const route = pickRoute();
        const stat = byRoute.get(route.url);
        const started = process.hrtime.bigint();
        let res;
        if (route.url === "/_rpc") {
          res = await request("/_rpc?id=bench-echo", {
            method: "POST",
            headers: { "content-type": "application/json", "x-anaemia-token": token },
            body: JSON.stringify(["bench"]),
            agent,
          });
        } else {
          res = await request(route.url, { agent });
        }
        stat.requests += 1;
        if (res.status !== 200) {
          stat.errors += 1;
          totalErrors += 1;
        }
        latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
    }),
  );

  latencies.sort((a, b) => a - b);
  const total = latencies.length;
  const elapsedSec = durationSec;
  const mean = latencies.reduce((a, b) => a + b, 0) / (total || 1);
  const summary = {
    runner: "node",
    durationSec,
    concurrency: Math.min(concurrency, 32),
    totalRequests: total,
    requestsPerSecond: +(total / elapsedSec).toFixed(1),
    meanMs: +mean.toFixed(2),
    p50Ms: +percentile(latencies, 0.5).toFixed(2),
    p90Ms: +percentile(latencies, 0.9).toFixed(2),
    p95Ms: +percentile(latencies, 0.95).toFixed(2),
    p99Ms: +percentile(latencies, 0.99).toFixed(2),
    maxMs: +latencies[latencies.length - 1].toFixed(2),
    errors: totalErrors,
    byRoute: Object.fromEntries(
      [...byRoute].map(([url, s]) => [url, { requests: s.requests, errors: s.errors }]),
    ),
  };
  return summary;
}

async function runExternalLoad(executable, buildArgs) {
  const url = `http://127.0.0.1:${port}/`;
  const cmd = executable === "ohama" ? "oha" : executable;
  if (!fs.existsSync(appDir)) throw new Error("bench app missing");
  await runProcess(cmd, [...(buildArgs ?? []), "-z", `${durationSec}s`, "-c", String(concurrency), url], {
    stdio: "inherit",
  });
}

async function main() {
  ensureLocalDeps();
  if (doBuild) {
    console.log("[bench] building app…");
    await buildApp();
  }

  console.log(`[bench] starting server on 127.0.0.1:${port}${profile ? " (profiling)" : ""}…`);
  server = startServer();
  try {
    await waitReady();
  } catch (error) {
    serverStopped = true;
    server.kill();
    throw error;
  }

  let summary;
  try {
    if (runner === "node") {
      const token = await fetchRpcToken();
      console.log(`[bench] warming up (${Math.min(concurrency, 32)} workers, ${durationSec}s)…`);
      await runNodeLoad(token); // warmup pass to fill the static cache
      console.log(`[bench] benchmark pass...`);
      summary = await runNodeLoad(token);
    } else if (runner === "oha" || runner === "autocannon") {
      await runExternalLoad(runner, runner === "autocannon" ? [] : []);
    } else {
      throw new Error(`unknown --runner=${runner}`);
    }

    console.log("\n[bench] results");
    console.table?.(summary ?? {});
    if (runner === "node") {
      console.log(`  req/s        ${summary.requestsPerSecond}`);
      console.log(`  mean / p50 / p90 / p95 / p99 / max`);
      console.log(`  ${summary.meanMs} / ${summary.p50Ms} / ${summary.p90Ms} / ${summary.p95Ms} / ${summary.p99Ms} / ${summary.maxMs} ms`);
      console.log(`  errors       ${summary.errors}/${summary.totalRequests}`);
      for (const [url, s] of Object.entries(summary.byRoute)) {
        console.log(`    ${url.padEnd(10)} n=${s.requests} errors=${s.errors}`);
      }
      if (outFile) {
        fs.writeFileSync(outFile, JSON.stringify({ ts: new Date().toISOString(), ...summary }, null, 2));
        console.log(`  wrote ${outFile}`);
      }
    }
  } finally {
    serverStopped = true;
    server.kill();
    if (profile) {
      const profDir = path.join(__dirname, "profiles");
      fs.mkdirSync(profDir, { recursive: true });
      // the server flushes the profile during graceful shutdown (SIGTERM), so
      // give it a moment to land before listing.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (fs.readdirSync(profDir).some((f) => f.endsWith(".cpuprofile"))) break;
        await sleep(150);
      }
      const files = fs.readdirSync(profDir).filter((f) => f.endsWith(".cpuprofile") || f.endsWith(".heapprofile"));
      console.log(`\n[bench] profiles in ${profDir}: ${files.length ? files.join(", ") : "none"}`);
      if (files.some((f) => f.endsWith(".cpuprofile"))) {
        console.log("[bench] open the .cpuprofile in https://www.speedscope.app");
      }
    }
  }
}

main().catch((error) => {
  console.error(`[bench] failed:`, error);
  if (server) {
    serverStopped = true;
    server.kill();
  }
  process.exit(1);
});