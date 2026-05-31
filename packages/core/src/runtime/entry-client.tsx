import { hydrate, render } from "solid-js/web";
import { Router } from "@solidjs/router";
import { ENTRY_SELECTOR } from "./shared/constants.js";

// @ts-expect-error - resolved by Rspack
import App, { preloadActiveClientRoute } from "anaemia-user-app";

const mountTarget = document.querySelector(ENTRY_SELECTOR) as HTMLElement | null;

if (!mountTarget) {
  throw new Error("[anaemia] missing mount target");
}

const root = mountTarget;

async function start() {
  await preloadActiveClientRoute(window.location.pathname);

  const mount = root.hasChildNodes() ? hydrate : render;

  mount(
    () => (
      <Router>
        <App />
      </Router>
    ),
    root,
  );
}

await start();
