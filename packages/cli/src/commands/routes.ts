import type { CAC } from "cac";
import logger from "../utils/logger.js";
import { scanRoutes } from "@anaemia/bundler";
import pc from "picocolors";

export function register(cli: CAC) {
  cli.command("routes", "print the scanned route manifest").action(async () => {
    const appRoot = process.cwd();
    const routes = await scanRoutes(appRoot);

    logger.info("scanned route architecture:\n");

    routes.forEach((r, i) => {
      const isLast = i === routes.length - 1;
      const branch = isLast ? "└─" : "├─";
      const indent = isLast ? "   " : "│  ";

      const typeLabel = r.type === "catch-all" ? pc.red(`[${r.type}]`) : r.type === "layout" ? pc.yellow(`[${r.type}]`) : pc.green(`[${r.type}]`);
      console.log(`${branch} ${pc.cyan(r.urlPattern)} ${typeLabel}`);

      const lines: string[] = [];
      if (r.params.length) lines.push(`params: ${pc.magenta(r.params.join(", "))}`);
      if (r.chunkName) lines.push(`chunk:  ${pc.dim(r.chunkName)}`);
      if (r.layouts.length) lines.push(`layouts: ${pc.dim(String(r.layouts.length))}`);

      lines.forEach((line, li) => {
        const isLastLine = li === lines.length - 1;
        console.log(`${indent}${isLastLine ? "└─" : "├─"} ${line}`);
      });

      if (!isLast) console.log("│");
    });
  });
}
