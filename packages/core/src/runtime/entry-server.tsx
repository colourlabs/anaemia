import { createServerApp } from "./server/app.js";
import { serveServer } from "./server/boot.js";
import { createRuntimeEnv } from "./server/env.js";
import { createManifestStore } from "./server/manifest.js";

// @ts-expect-error - resolved by Rspack
import App from "anaemia-user-app";

// @ts-expect-error - resolved by Rspack
import { preloadActiveClientRoute, serverLoaderRegistry, serverGuardRegistry } from "anaemia-user-app";

// @ts-expect-error - resolved by Rspack
import { registerServerRoutes } from "__anaemia_server_routes__";

// @ts-expect-error - resolved by Rspack
import userConfig from "__anaemia_user_config__";

const env = createRuntimeEnv();
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
    console.error("[anaemia] failed to initialize:", err);
    process.exit(1);
  });

export default app;
