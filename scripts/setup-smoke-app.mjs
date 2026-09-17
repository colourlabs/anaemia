import fs from "node:fs";
import path from "node:path";

const PACKAGES = ["core", "bundler", "cli", "plugin-mdx", "eslint-plugin"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    args[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function findTarballs(pkgsDir) {
  const found = new Map();
  for (const entry of fs.readdirSync(pkgsDir)) {
    const match = entry.match(/^anaemia-(.+)-\d+\.\d+\.\d+\.tgz$/);
    if (match) found.set(match[1], path.resolve(pkgsDir, entry));
  }
  return found;
}

function patchWorkspaceManifest(appDir, overrides) {
  const manifestPath = path.join(appDir, "pnpm-workspace.yaml");
  const existing = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
  const keys = new Set(Object.keys(overrides));
  const lines = existing.split("\n").filter((line) => {
    const match = line.match(/^\s*"?([^"\s:]+)"?\s*:/);
    return !(match && keys.has(match[1]));
  });

  const entries = Object.entries(overrides).map(([name, target]) => `  "${name}": "${target}"`);
  const headerIndex = lines.findIndex((line) => /^overrides:\s*$/.test(line));

  if (headerIndex === -1) {
    lines.push("overrides:", ...entries);
  } else {
    lines.splice(headerIndex + 1, 0, ...entries);
  }

  fs.writeFileSync(manifestPath, `${lines.join("\n").replace(/\n*$/, "")}\n`, "utf8");
}

const { app, pkgs } = parseArgs(process.argv.slice(2));

if (!app || !pkgs) {
  console.error("usage: setup-smoke-app.mjs --app <dir> --pkgs <dir>");
  process.exit(1);
}

const appDir = path.resolve(app);
const pkgsDir = path.resolve(pkgs);
const tarballs = findTarballs(pkgsDir);
const overrides = {};

for (const name of PACKAGES) {
  const tarball = tarballs.get(name);
  if (!tarball) {
    console.error(`missing locally packed @anaemia/${name} tarball in ${pkgsDir}`);
    process.exit(1);
  }
  overrides[`@anaemia/${name}`] = `file:${tarball}`;
}

patchWorkspaceManifest(appDir, overrides);

console.log(`pointed ${appDir} at ${PACKAGES.length} locally built @anaemia packages`);
