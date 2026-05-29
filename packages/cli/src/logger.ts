import pc from "picocolors";

const logger = {
  prefix: pc.bold(pc.red("[anaemia]")),

  info(msg: string) {
    console.log(`${this.prefix} ${pc.cyan(msg)}`);
  },

  success(msg: string) {
    console.log(`${this.prefix} ${pc.green(msg)}`);
  },

  warn(msg: string) {
    console.log(`${this.prefix} ${pc.yellow(msg)}`);
  },

  error(msg: string, detail?: unknown) {
    console.error(`${this.prefix} ${pc.red(msg)}`);
    if (detail) console.error(detail);
  },
  
  compiler(msg: string) {
    console.log(`${pc.bold(pc.magenta("[compiler]"))} ${msg}`);
  },
};

export default logger;