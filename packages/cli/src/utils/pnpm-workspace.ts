import fs from "node:fs";
import path from "node:path";

const BUILD_ALLOWLIST = ["allowBuilds:", '  "@parcel/watcher": true', "  simple-git-hooks: true"];

export function ensurePnpmWorkspace(targetPath: string): void {
  const wsPath = path.join(targetPath, "pnpm-workspace.yaml");
  const existing = fs.existsSync(wsPath) ? fs.readFileSync(wsPath, "utf8") : "";

  const lines: string[] = [];

  if (/minimumReleaseAgeStrict\s*:\s*false/.test(existing)) {
    lines.push("minimumReleaseAgeStrict: false", "");
  }

  const hasAllowlist = existing.includes("allowBuilds") && existing.includes("@parcel/watcher");

  if (hasAllowlist) {
    return;
  }

  lines.push(...BUILD_ALLOWLIST);

  fs.writeFileSync(wsPath, lines.join("\n") + "\n", "utf8");
}
