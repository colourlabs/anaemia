import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PACKAGES = [
  "packages/core",
  "packages/bundler",
  "packages/cli",
];

const DRY_RUN = process.argv.includes("--dry-run");

function run(cmd, cwd = root) {
  console.log(`\n$ ${cmd}${DRY_RUN ? " (dry run)" : ""}`);
  if (!DRY_RUN) execSync(cmd, { stdio: "inherit", cwd });
}

function readPkg(pkgPath) {
  return JSON.parse(fs.readFileSync(path.join(pkgPath, "package.json"), "utf-8"));
}

function writePkg(pkgPath, pkg) {
  fs.writeFileSync(path.join(pkgPath, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

const snapshots = PACKAGES.map((p) => {
  const abs = path.resolve(root, p);
  const pkg = readPkg(abs);
  return { abs, name: pkg.name, version: pkg.version };
});

const highest = snapshots
  .map((s) => s.version.split(".").map(Number))
  .reduce((a, b) => (a[1] >= b[1] ? a : b));
const newVersion = `${highest[0]}.${highest[1] + 1}.0`;

console.log(`\ncurrent versions:`);
snapshots.forEach((s) => console.log(`  ${s.name}: ${s.version}`));
console.log(`\nnew version: ${newVersion}`);

function rollback() {
  console.log("\n⚠ rolling back version changes...");
  for (const { abs, version, name } of snapshots) {
    try {
      const pkg = readPkg(abs);
      pkg.version = version;
      for (const depField of ["dependencies", "devDependencies", "peerDependencies"]) {
        if (!pkg[depField]) continue;
        for (const { name: depName, version: depVersion } of snapshots) {
          if (pkg[depField][depName]) {
            pkg[depField][depName] = `^${depVersion}`;
          }
        }
      }
      writePkg(abs, pkg);
      console.log(`  restored ${name} → ${version}`);
    } catch (err) {
      console.error(`  failed to restore ${name}: ${err.message}`);
    }
  }
}

try {
  console.log("\n=== checking git state ===");
  const dirty = execSync("git status --porcelain").toString().trim();
  if (dirty) {
    console.error("working directory is not clean. commit or stash changes before releasing.");
    process.exit(1);
  }

  console.log("\n=== building ===");
  run("pnpm run build");

  console.log("\n=== typechecking ===");
  run("pnpm run typecheck");

  console.log("\n=== testing ===");
  run("pnpm run test");

  console.log("\n=== bumping versions ===");
  for (const { abs, name } of snapshots) {
    const pkg = readPkg(abs);
    pkg.version = newVersion;

    for (const depField of ["dependencies", "devDependencies", "peerDependencies"]) {
      if (!pkg[depField]) continue;
      for (const { name: depName } of snapshots) {
        if (pkg[depField][depName]) {
          pkg[depField][depName] = `^${newVersion}`;
          console.log(`  updated ${name} → ${depField}.${depName} to ^${newVersion}`);
        }
      }
    }

    writePkg(abs, pkg);
    console.log(`  bumped ${name} → ${newVersion}`);
  }


  console.log("\n=== publishing ===");
  const published = [];
  for (const { abs, name } of snapshots) {
    try {
      run(`pnpm publish --access public --no-git-checks`, abs);
      published.push(name);
    } catch (err) {
      console.error(`\n✗ failed to publish ${name}: ${err.message}`);
      console.error(`already published: ${published.join(", ") || "none"}`);
      rollback();
      process.exit(1);
    }
  }

  console.log("\n=== committing release ===");
  run(`git add ${PACKAGES.map((p) => path.join(p, "package.json")).join(" ")}`);
  run(`git commit -m "release v${newVersion}"`);
  run(`git tag -a v${newVersion} -m "release v${newVersion}"`);
  run("git push --follow-tags");

  console.log(`\n✓ released v${newVersion}`);
} catch (err) {
  console.error(`\n✗ release failed: ${err.message}`);
  rollback();
  process.exit(1);
}