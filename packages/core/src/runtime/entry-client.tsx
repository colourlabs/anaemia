import { hydrate } from "solid-js/web";
import { Router } from "@solidjs/router";

// @ts-ignore - mapped by Rspack
import App from "anaemia-user-app";

const targetElement = document.querySelector("[anaemia-entry]");

if (targetElement) {
  hydrate(
    () => (
      <Router>
        <App />
      </Router>
    ),
    targetElement
  );
} else {
  console.error("[anaemia framework error]: could not find an element containing the 'anaemia-entry' attribute inside your index.html template. hydration aborted.");
}
