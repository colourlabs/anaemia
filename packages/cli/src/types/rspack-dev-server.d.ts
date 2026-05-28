// fuck you typescript

declare module "@rspack/dev-server" {
  import type { Compiler, MultiCompiler, DevServer } from "@rspack/core";

  export type DevServerConfiguration = DevServer;

  export class RspackDevServer {
    constructor(config: DevServer, compiler: Compiler | MultiCompiler);
    start(): Promise<void>;
    stop(): Promise<void>;
  }

  export default RspackDevServer;
}