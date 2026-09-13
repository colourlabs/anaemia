import pc from "picocolors";
// subpath export, not the full "@anaemia/core" index: evaluating the index in a
// plain Node process pulls in @solidjs/router, which is only safe inside the
// rspack server bundle.
import { createLogger, type LoggerSink } from "@anaemia/core/logger";

const prefix = pc.bold(pc.red("[anaemia]"));

/**
 * build-time console sink: same Logger interface as the runtime server (so a
 * single set of event shapes flows everywhere), colored for terminals.
 */
const cliColorSink: LoggerSink = (event) => {
  const color =
    event.level === "error" ? pc.red : event.level === "warn" ? pc.yellow : event.level === "debug" ? pc.dim : pc.cyan;
  const msg = `${prefix} ${color(event.message)}`;
  if (event.level === "error") {
    console.error(msg);
    if (event.data !== undefined) console.error(event.data);
  } else {
    console.log(msg);
  }
};

const base = createLogger([cliColorSink]);

const logger = {
  dim: pc.dim,

  info(msg: string) {
    base.info(msg);
  },

  success(msg: string) {
    console.log(`${prefix} ${pc.green(msg)}`);
  },

  warn(msg: string) {
    base.warn(msg);
  },

  error(msg: string, detail?: unknown) {
    base.error(msg, detail);
  },

  compiler(msg: string) {
    console.log(`${pc.bold(pc.magenta("[compiler]"))} ${msg}`);
  },
};

export default logger;
