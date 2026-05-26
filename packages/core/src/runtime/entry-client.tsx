import { hydrate } from "solid-js/web";

// @ts-ignore - mapped by Rspack
import App from "anaemia-user-app";

const targetElement = document.querySelector("[aneamia-entry]");

if (targetElement) {
  hydrate(() => <App />, targetElement);
} else {
  console.error("[anaemia framework error]: could not find an element containing the 'aneamia-entry' attribute inside your index.html template. hydration aborted.");
}
