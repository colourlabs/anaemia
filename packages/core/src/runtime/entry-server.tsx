import { createServerApp } from "./server/app.js";
import { serveServer } from "./server/boot.js";
import { createRuntimeEnv } from "./server/env.js";
import { createManifestStore } from "./server/manifest.js";
import { getLogger, setLogger } from "./server/logger.js";

// @ts-expect-error - resolved by Rspack
import App from "anaemia-user-app";

// @ts-expect-error - resolved by Rspack
import { preloadActiveClientRoute, serverLoaderRegistry, serverGuardRegistry } from "anaemia-user-app";

// @ts-expect-error - resolved by Rspack
import { registerServerRoutes } from "__anaemia_server_routes__";

// @ts-expect-error - resolved by Rspack
import userConfig from "__anaemia_user_config__";

const env = createRuntimeEnv();

// apply the application's logger before anything else can log so startup and
// error output go through it too.
if (userConfig.logger) {
  setLogger(userConfig.logger);
}

const manifestStore = createManifestStore(env);

const app = createServerApp({
  App,
  env,
  plugins: userConfig.plugins ?? [],
  rpc: userConfig.rpc,
  preloadActiveClientRoute,
  serverLoaderRegistry,
  serverGuardRegistry,
  registerServerRoutes,
  getManifestSnapshot: manifestStore.getSnapshot,
  loadManifestAndTemplate: manifestStore.load,
});

manifestStore
  .load()
  .then(() => {
    serveServer(app, env);
  })
  .catch((err) => {
    getLogger().error("failed to initialize", err);
    process.exit(1);
  });

export default app;
