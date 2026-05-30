import type { CAC } from "cac";
import spawn from "cross-spawn";

export function register(cli: CAC) {
  cli.command("typecheck", "run TypeScript type checking without emitting").action(async () => {
    const appRoot = process.cwd();
    const result = spawn.sync("tsc", ["--noEmit"], { stdio: "inherit", cwd: appRoot });
    if (result.status !== 0) process.exit(result.status ?? 1);
  });
};